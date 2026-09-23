/* A live website → design/manifest.json + design/renders/* + design/assets/* (the same files the
   Figma extractor writes). Run through extract.ts:
     pnpm extract --from-url <url> [--max-pages 30] [--only /a,/b] [--mobile-width 390] [--concurrency 2]
     pnpm extract --from-url <url> --inspect [--json]      (HTML only, no browser)
   Only for the client's own site or with permission; the origin is recorded in the manifest.
   Same-origin pages only, robots.txt respected (`--ignore-robots` only for a site you own whose
   robots.txt blocks everything, e.g. a noindex preview), webfont files never downloaded.
   Polite by construction (website-lib.ts `Scheduler`): 2 requests at a time (max 4), 300 ms
   between request starts, 15 s timeout, one retry, Retry-After honoured, slows down after 2
   failures in a row and gives up after 8; at most 2 × --max-pages page requests. The inventory
   of pages comes from links and sitemaps without fetching them; only a sample is fetched.
   Everything that is not I/O lives in ./website-lib.ts. */
import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import type { Browser, BrowserContext, Page } from 'playwright'
import {
  cleanFamily,
  classifyUrl,
  coloursInCss,
  commonTitleSuffix,
  crawl,
  detectCollections,
  fontFacesInCss,
  fontServiceFamilies,
  htmlImages,
  htmlInlineStyles,
  htmlLinks,
  htmlStylesheets,
  htmlTitle,
  LOGIN_PATH,
  MAX_CONCURRENCY,
  parseRobots,
  parseSitemap,
  POLITE,
  robotsAllows,
  routeName,
  routeSlug,
  Scheduler,
  segment,
  errorText,
  snapshotDom,
  snapshotLinks,
} from './website-lib.ts'
import type {
  Attempted,
  Collection,
  CrawledPage,
  FontSource,
  Group,
  Politeness,
  Robots,
  Skip,
  Snapshot,
  SnapNode,
  TreeNode,
  WebSection,
} from './website-lib.ts'
import { dedupeRenders, dedupeRoutePaths } from './route-key.ts'

/* Says what we are, so a webmaster who sees it in the logs can find out. */
export const USER_AGENT =
  'Kiln/0.1 (+https://github.com/kennerluoma/agency-platform; site recreation for the site owner)'
const DESKTOP = { width: 1440, height: 900 }
const MAX_IMAGE_BYTES = 10 * 1024 * 1024
/* Instances fetched per parent path (a collection is recognised from a sample). */
const PER_DIR_CAP = 12
const IMAGE_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
  'image/avif': 'avif',
}
const log = (...a: Array<unknown>) => console.error(...a)

export type Options = {
  url: string
  maxPages: number
  only: Array<string> | undefined
  mobileWidth: number
  inspect: boolean
  json: boolean
  ignoreRobots: boolean
  concurrency: number
}

export function parseArgs(argv: Array<string>): Options {
  const after = (flag: string) => {
    const i = argv.indexOf(flag)
    return i >= 0 ? argv[i + 1] : undefined
  }
  const url = after('--from-url')
  if (!url || url.startsWith('--'))
    throw new Error(
      '--from-url needs a URL: pnpm extract --from-url https://example.com',
    )
  const start = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`)
  const num = (flag: string, fallback: number) => {
    const v = Number(after(flag))
    return Number.isFinite(v) && v > 0 ? Math.floor(v) : fallback
  }
  const only = after('--only')
    ?.split(',')
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => (p.startsWith('/') ? p : `/${p}`))
  return {
    url: start.href,
    maxPages: num('--max-pages', 30),
    only: only?.length ? only : undefined,
    mobileWidth: num('--mobile-width', 390),
    inspect: argv.includes('--inspect'),
    json: argv.includes('--json'),
    ignoreRobots: argv.includes('--ignore-robots'),
    concurrency: Math.min(
      MAX_CONCURRENCY,
      num('--concurrency', POLITE.concurrency),
    ),
  }
}

/* The one place that talks HTTP (tests pass a fake). Every call goes through a Scheduler. */
export type Get = (
  url: string,
  init: { signal: AbortSignal; accept: string },
) => Promise<Response>
export const httpGet: Get = (url, { signal, accept }) =>
  fetch(url, {
    headers: { 'user-agent': USER_AGENT, accept },
    redirect: 'follow',
    signal,
  })
export type Deps = { get: Get; polite: Politeness }
const depsFor = (o: Options, deps?: Partial<Deps>): Deps => ({
  get: deps?.get ?? httpGet,
  polite: deps?.polite ?? { ...POLITE, concurrency: o.concurrency },
})
/* Page fetches may use at most twice the page budget (retries included); robots.txt, sitemaps
   and stylesheets share a small allowance of their own. */
const budgetFor = (max: number) => ({ page: max * 2, meta: 30 })

async function fetchText(
  s: Scheduler,
  get: Get,
  url: string,
): Promise<string | undefined> {
  try {
    const r = await s.run('meta', async (signal) => {
      const res = await get(url, { signal, accept: 'text/plain,*/*;q=0.8' })
      const value = res.ok ? await res.text() : undefined
      if (!res.ok) await res.body?.cancel()
      return {
        status: res.status,
        retryAfter: res.headers.get('retry-after'),
        value,
      }
    })
    return r.value
  } catch {
    return undefined
  }
}

// ---- robots + sitemap (stage A: no page is fetched here) ----

export async function siteRules(
  origin: string,
  ignoreRobots: boolean,
  s: Scheduler,
  get: Get,
) {
  const robotsTxt = (await fetchText(s, get, `${origin}/robots.txt`)) ?? ''
  const parsed = parseRobots(robotsTxt)
  const robots: Robots = ignoreRobots
    ? { rules: [], sitemaps: parsed.sitemaps }
    : parsed
  const sitemapUrls: Array<string> = []
  const queue = [...new Set([...parsed.sitemaps, `${origin}/sitemap.xml`])]
  for (let i = 0, fetched = 0; i < queue.length && fetched < 6; i++) {
    const sm = queue[i]
    if (!sm || !sm.startsWith(origin) || s.down) continue
    fetched++
    const xml = await fetchText(s, get, sm)
    if (!xml) continue
    const { urls, sitemaps } = parseSitemap(xml)
    sitemapUrls.push(...urls)
    for (const x of sitemaps) if (!queue.includes(x)) queue.push(x)
  }
  return { robots, sitemapUrls, blocksAll: !robotsAllows(parsed, '/') }
}

export function responseSkip(
  status: number,
  finalUrl: string,
  contentType: string,
): string | undefined {
  if (status === 401 || status === 403) return 'login required'
  if (status >= 400) return `HTTP ${status}`
  if (LOGIN_PATH.test(new URL(finalUrl).pathname))
    return 'login required (redirected to a login page)'
  if (contentType && !/html/i.test(contentType)) return 'not HTML'
  return undefined
}

// ---- inspect: HTML only ----

type InspectPage = {
  path: string
  title: string
  images: Array<string>
  css: Array<string>
  inline: Array<string>
  fontLinks: Array<string>
}

export type InspectResult = {
  url: string
  pages: Array<{ path: string; title: string; images: Array<string> }>
  fonts: Array<FontSource>
  colours: Array<{ hex: string; uses: number }>
  skipped: Array<Skip>
  /** Same-origin pages known from links + sitemaps (most of them never fetched). */
  found: number
  /** Pages grouped by first path segment; `sampled` = how many of them are in `pages`. */
  groups: Array<Group>
  notFetched: number
  /** Requests made to the site (pages, retries, robots.txt, sitemaps, stylesheets). */
  requests: number
  /** Set when the site stopped responding and the inspect gave up. */
  aborted?: string
}

export async function inspectSite(
  o: Options,
  deps?: Partial<Deps>,
): Promise<InspectResult> {
  const { get, polite } = depsFor(o, deps)
  const origin = new URL(o.url).origin
  const max = o.only ? o.only.length : o.maxPages
  const s = new Scheduler(polite, budgetFor(max))
  const { robots, sitemapUrls, blocksAll } = await siteRules(
    origin,
    o.ignoreRobots,
    s,
    get,
  )
  const crawled = await crawl<InspectPage>({
    origin,
    seeds: o.only ? o.only.map((p) => origin + p) : [o.url],
    sitemap: sitemapUrls,
    discover: !o.only,
    max,
    robots,
    scheduler: s,
    load: async (url, signal) => {
      const res = await get(url, {
        signal,
        accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
      })
      const finalUrl = res.url || url
      const status = res.status
      const retryAfter = res.headers.get('retry-after')
      const why = responseSkip(
        status,
        finalUrl,
        res.headers.get('content-type') ?? '',
      )
      if (why) {
        await res.body?.cancel()
        return { status, retryAfter, value: { kind: 'skip', why } }
      }
      const html = await res.text()
      const css = htmlStylesheets(html, finalUrl)
      return {
        status,
        retryAfter,
        value: {
          kind: 'page',
          finalUrl,
          links: htmlLinks(html),
          data: {
            path: new URL(finalUrl).pathname,
            title: htmlTitle(html),
            images: htmlImages(html, finalUrl).slice(0, 4),
            css: css.filter((c) => c.startsWith(origin)),
            inline: htmlInlineStyles(html),
            fontLinks: css.filter((c) => fontServiceFamilies(c).length),
          },
        },
      }
    },
  })
  const { pages } = crawled
  // Fonts and colours: the site's own stylesheets (first few) + inline <style>, never font files.
  const cssUrls = [...new Set(pages.flatMap((p) => p.data.css))].slice(0, 6)
  const sheets: Array<{ u: string; css: string }> = []
  for (const u of cssUrls)
    if (!s.down) sheets.push({ u, css: (await fetchText(s, get, u)) ?? '' })
  const inline = [...new Set(pages.flatMap((p) => p.data.inline))]
  const fonts = dedupeFonts([
    ...[...new Set(pages.flatMap((p) => p.data.fontLinks))].flatMap(
      fontServiceFamilies,
    ),
    ...sheets.flatMap((x) => fontFacesInCss(x.css, x.u)),
    ...inline.flatMap((css) => fontFacesInCss(css, origin)),
  ])
  const colourCounts = new Map<string, number>()
  for (const css of [...sheets.map((x) => x.css), ...inline])
    for (const c of coloursInCss(css))
      colourCounts.set(c.hex, (colourCounts.get(c.hex) ?? 0) + c.uses)
  const colours = [...colourCounts.entries()]
    .map(([hex, uses]) => ({ hex, uses }))
    .sort((a, b) => b.uses - a.uses)
    .slice(0, 16)
  return {
    url: o.url,
    pages: pages.map((p) => ({
      path: p.path,
      title: p.data.title,
      images: p.data.images,
    })),
    fonts,
    colours,
    skipped:
      blocksAll && !o.ignoreRobots && !pages.length
        ? [
            {
              url: `${origin}/robots.txt`,
              why: 'robots.txt disallows every page (pass --ignore-robots only for a site you own)',
            },
            ...crawled.skipped,
          ]
        : crawled.skipped,
    found: crawled.found,
    groups: crawled.groups,
    notFetched: crawled.notFetched,
    requests: s.attempts,
    ...(s.down && { aborted: s.down }),
  }
}

export async function inspect(o: Options) {
  const t0 = Date.now()
  const result = await inspectSite(o)
  const secs = ((Date.now() - t0) / 1000).toFixed(1)
  if (result.aborted) {
    // stdout, so the app's error shows it; the partial result is not a page list to pick from.
    console.log(result.aborted)
    log(
      `${result.pages.length} page(s) read before it stopped; ${result.requests} request(s) in ${secs} s`,
    )
    process.exit(1)
  }
  log(
    `inspected in ${secs} s: ${result.requests} request(s), ${result.pages.length} page(s) read of ${result.found} found`,
  )
  if (o.json) {
    process.stdout.write(JSON.stringify(result) + '\n')
    return
  }
  console.log(
    `${o.url}: found ${result.found} page(s) in ${result.groups.length} group(s); read ${result.pages.length}, ${result.notFetched} not fetched`,
  )
  for (const g of result.groups)
    console.log(`  ${g.prefix}  ${g.count} (${g.sampled} read)`)
  for (const p of result.pages)
    console.log(`  ${p.path}  ${p.title}  (${p.images.length} image(s))`)
  console.log(
    `fonts: ${result.fonts.map((f) => `${f.family} [${f.source}]`).join(', ') || 'none found'}`,
  )
  console.log(`colours: ${result.colours.map((c) => c.hex).join(' ')}`)
  if (result.skipped.length) {
    console.log(`skipped ${result.skipped.length}:`)
    for (const x of result.skipped.slice(0, 40))
      console.log(`  ${x.url}  (${x.why})`)
  }
}

function dedupeFonts(list: Array<FontSource>): Array<FontSource> {
  const out = new Map<string, FontSource>()
  for (const f of list) {
    const key = f.family.toLowerCase()
    const cur = out.get(key)
    // Prefer a font-face URL (it names the file) over a bare family.
    if (!cur || (!cur.url && f.url)) out.set(key, f)
  }
  return [...out.values()]
}

// ---- full extraction: browser ----

async function settle(page: Page) {
  await page
    .waitForLoadState('networkidle', { timeout: 2000 })
    .catch(() => undefined)
  // Walk down the page so lazy images load, then back to the top for the snapshot.
  await page.evaluate(async () => {
    const step = Math.max(400, innerHeight)
    for (
      let y = 0, i = 0;
      y < document.documentElement.scrollHeight && i < 40;
      y += step, i++
    ) {
      scrollTo(0, y)
      await new Promise((r) => setTimeout(r, 50))
    }
    scrollTo(0, 0)
  })
  await page
    .waitForLoadState('networkidle', { timeout: 2000 })
    .catch(() => undefined)
  await page.evaluate(async () => {
    await document.fonts.ready
  })
}

async function shoot(
  page: Page,
  lint: Array<LintNote>,
  node: string,
): Promise<Buffer> {
  try {
    return await page.screenshot({ fullPage: true, timeout: 20_000 })
  } catch (e) {
    lint.push({
      level: 'warn',
      node,
      name: node,
      msg: `full-page screenshot failed (${e instanceof Error ? e.message.split('\n')[0] : String(e)}); viewport only`,
    })
    return page.screenshot()
  }
}

type LintNote = {
  level: 'warn' | 'info'
  node: string
  name: string
  msg: string
}
type Captured = { snap: Snapshot; shot: Buffer }

/* One browser navigation. The page stays open for the caller (settle, snapshot, screenshot),
   which closes it; `status`/`retryAfter` feed the scheduler's health check. */
async function visit(
  ctx: BrowserContext,
  url: string,
  timeoutMs: number,
): Promise<{
  page: Page
  status: number
  retryAfter: string | null
  skip?: string
}> {
  const page = await ctx.newPage()
  try {
    const res = await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: timeoutMs,
    })
    if (!res) return { page, status: 0, retryAfter: null, skip: 'no response' }
    const headers = res.headers()
    const why = responseSkip(
      res.status(),
      page.url(),
      headers['content-type'] ?? '',
    )
    return {
      page,
      status: res.status(),
      retryAfter: headers['retry-after'] ?? null,
      ...(why && { skip: why }),
    }
  } catch (e) {
    await page.close()
    throw e
  }
}

type Downloaded = { file: string; bytes: number } | { skip: string }
async function download(
  src: string,
  signal: AbortSignal,
): Promise<Attempted<Downloaded>> {
  const done = (
    value: Downloaded,
    status = 200,
    retryAfter: string | null = null,
  ) => ({
    status,
    retryAfter,
    value,
  })
  let bytes: Buffer
  let type = ''
  if (src.startsWith('data:')) {
    const m = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(src)
    if (!m) return done({ skip: 'unreadable data: URI' })
    type = m[1] ?? ''
    bytes = m[2]
      ? Buffer.from(m[3] ?? '', 'base64')
      : Buffer.from(decodeURIComponent(m[3] ?? ''))
    if (bytes.length < 2048)
      return done({ skip: 'placeholder (tiny data: URI)' })
  } else {
    const res = await fetch(src, {
      // Ask for modern formats: image CDNs (Sanity, Imgix, Cloudinary) then send WebP (Sanity takes it; AVIF it may not).
      headers: {
        'user-agent': USER_AGENT,
        accept: 'image/webp,image/*;q=0.8',
      },
      signal,
    })
    const status = res.status
    const retryAfter = res.headers.get('retry-after')
    const skip = async (why: string) => {
      await res.body?.cancel()
      return { status, retryAfter, value: { skip: why } }
    }
    if (!res.ok || !res.body) return skip(`HTTP ${status}`)
    type = res.headers.get('content-type') ?? ''
    if (!type.startsWith('image/'))
      return skip(`not an image (${type || 'no type'})`)
    if (Number(res.headers.get('content-length') ?? 0) > MAX_IMAGE_BYTES)
      return skip('over 10 MB')
    const chunks: Array<Uint8Array> = []
    let size = 0
    const reader = res.body.getReader()
    for (;;) {
      const chunk = await reader.read()
      if (chunk.done) break
      const value = chunk.value
      size += value.byteLength
      if (size > MAX_IMAGE_BYTES) {
        await reader.cancel()
        return done({ skip: 'over 10 MB' }, status)
      }
      chunks.push(value)
    }
    bytes = Buffer.concat(chunks)
  }
  const ext = IMAGE_EXT[type.split(';')[0]?.trim() ?? ''] ?? 'img'
  const file = `design/assets/${createHash('sha256').update(bytes).digest('hex').slice(0, 16)}.${ext}`
  await writeFile(file, bytes)
  return done({ file, bytes: bytes.length })
}

async function pool<T, R>(
  items: Array<T>,
  n: number,
  fn: (t: T) => Promise<R>,
): Promise<Array<R>> {
  const out: Array<R> = []
  let i = 0
  const worker = async () => {
    while (i < items.length) {
      const idx = i++
      const item = items[idx]
      if (item !== undefined) out[idx] = await fn(item)
    }
  }
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker))
  return out
}

/* Palette accumulators, same shapes as extract.ts so its normaliser runs on the result. */
function palette(snaps: Array<Snapshot>) {
  const colors = new Map<string, number>()
  const fonts = new Map<
    string,
    {
      family: string
      size: number
      weight: number
      lineHeight?: number
      uses: number
    }
  >()
  const radii = new Map<number, number>()
  const spacing = new Map<number, number>()
  const families = new Map<string, number>()
  const bump = <K>(m: Map<K, number>, k: K, n = 1) =>
    m.set(k, (m.get(k) ?? 0) + n)
  const walk = (n: SnapNode) => {
    if (n.bg) bump(colors, n.bg)
    if (n.color) bump(colors, n.color)
    if (n.font && n.font.size > 0) {
      const key = `${n.font.family}/${n.font.size}/${n.font.weight}`
      const e = fonts.get(key) ?? {
        family: n.font.family,
        size: n.font.size,
        weight: n.font.weight,
        ...(n.font.lineHeight !== null && { lineHeight: n.font.lineHeight }),
        uses: 0,
      }
      e.uses++
      fonts.set(key, e)
      bump(families, n.font.family)
    }
    if (n.radius !== null) bump(radii, n.radius)
    if (n.layout)
      for (const v of [n.layout.gap, ...n.layout.padding])
        if (v > 0 && v <= 320) bump(spacing, v)
    n.children.forEach(walk)
  }
  for (const s of snaps) walk(s.root)
  const hist = (m: Map<number, number>) =>
    [...m.entries()]
      .map(([value, uses]) => ({ value, uses }))
      .sort((a, b) => b.uses - a.uses)
  return {
    colors: [...colors.entries()]
      .map(([hex, uses]) => ({ hex, uses }))
      .sort((a, b) => b.uses - a.uses),
    fonts: [...fonts.values()].sort((a, b) => b.uses - a.uses),
    radii: hist(radii),
    spacing: hist(spacing),
    families,
  }
}

const mapTree = (
  t: TreeNode,
  fileOf: (src: string) => string | undefined,
): TreeNode => {
  const { image, children, ...rest } = t
  const file = image ? fileOf(image) : undefined
  return {
    ...rest,
    ...(file && { image: file }),
    ...(image && !file && { imageUrl: image }),
    ...(children && { children: children.map((c) => mapTree(c, fileOf)) }),
  }
}

export async function extractWebsite(o: Options) {
  const origin = new URL(o.url).origin
  const crawledAt = new Date().toISOString()
  const lint: Array<LintNote> = []
  const { get, polite } = depsFor(o)
  const max = o.only ? o.only.length : o.maxPages
  const s = new Scheduler(polite, budgetFor(max))
  const stopIfDown = (stage: string) => {
    if (s.down)
      throw new Error(
        `${s.down} [${stage}; ${s.attempts} request(s) to ${origin}]`,
      )
  }
  const { robots, sitemapUrls, blocksAll } = await siteRules(
    origin,
    o.ignoreRobots,
    s,
    get,
  )
  const { chromium } = await import('playwright')
  const browser: Browser = await chromium.launch()
  try {
    const desktop = await browser.newContext({
      viewport: DESKTOP,
      serviceWorkers: 'block',
    })
    log(`crawling ${origin} (max ${max} page(s), ${s.concurrency} at a time)…`)
    const crawled = await crawl<Captured>({
      origin,
      seeds: o.only ? o.only.map((p) => origin + p) : [o.url],
      sitemap: sitemapUrls,
      discover: !o.only,
      max,
      robots,
      scheduler: s,
      ...(!o.only && { perDirCap: PER_DIR_CAP }),
      load: async (url, _signal, timeoutMs) => {
        const { page, status, retryAfter, skip } = await visit(
          desktop,
          url,
          timeoutMs,
        )
        try {
          if (skip)
            return { status, retryAfter, value: { kind: 'skip', why: skip } }
          await settle(page)
          const snap = await page.evaluate(snapshotDom)
          const shot = await shoot(page, lint, new URL(page.url()).pathname)
          log(`  ${new URL(page.url()).pathname}`)
          return {
            status,
            retryAfter,
            value: {
              kind: 'page',
              finalUrl: page.url(),
              links: snapshotLinks(snap.root),
              data: { snap, shot },
            },
          }
        } finally {
          await page.close()
        }
      },
    })
    const { pages, skipped } = crawled
    const pageAttempts = s.used.get('page') ?? 0
    log(
      `found ${crawled.found} page(s) in ${crawled.groups.length} group(s); captured ${pages.length}, ${crawled.notFetched} not fetched, ${pageAttempts} page request(s)`,
    )
    stopIfDown('crawl')
    if (!pages.length) {
      const why =
        blocksAll && !o.ignoreRobots
          ? `robots.txt on ${origin} disallows every page. If this is your own site (a noindex preview), pass --ignore-robots.`
          : `no pages captured: ${skipped
              .slice(0, 5)
              .map((s) => `${s.url} (${s.why})`)
              .join(', ')}`
      throw new Error(why)
    }

    // Sections, then collections (pages sharing a template under one parent path).
    const siteSuffix = commonTitleSuffix(pages.map((p) => p.data.snap.title))
    const segmented = pages.map((p) => ({
      ...p,
      seg: segment(p.data.snap, routeSlug(p.path)),
    }))
    const crawledPages: Array<CrawledPage> = segmented.map((p) => ({
      path: p.path,
      title: p.data.snap.title,
      sections: p.seg.sections,
      contentLinks: p.seg.sections
        .filter((s) => !['Header', 'Nav', 'Footer'].includes(s.type))
        .flatMap((s) =>
          s.content.links.map((l) => classifyUrl(l.href, p.url, origin)),
        )
        .flatMap((v) => (v.ok ? [v.path] : [])),
    }))
    const { collections, members } = detectCollections(
      crawledPages,
      origin,
      siteSuffix,
      crawled.inventory,
    )
    const routePages = segmented.filter((p) => !members.has(p.path))
    const samples = new Map<string, (typeof segmented)[number]>()
    for (const c of collections) {
      const first = segmented.find((p) => p.path === c.instances[0]?.path)
      if (first) samples.set(c.name, first)
    }

    // Images: every <img>/background on a kept page (and the collection instances), ≤ 10 MB each.
    await mkdir('design/renders', { recursive: true })
    await mkdir('design/assets', { recursive: true })
    const allSections = segmented.flatMap((p) => p.seg.sections)
    const srcs = [
      ...new Set(
        allSections.flatMap((s) => [
          ...s.images.map((i) => i.src),
          ...(s.repeat?.items ?? []).flatMap((i) => (i.image ? [i.image] : [])),
        ]),
      ),
    ]
    log(`downloading ${srcs.length} image(s)…`)
    const files = new Map<string, { file: string; bytes: number }>()
    const imageSkips: Array<Skip> = []
    // Images on the crawled origin go through the scheduler (they load the same server); image
    // CDNs and other hosts are fetched 6 at a time.
    const sameOrigin = (src: string) => {
      try {
        return new URL(src).origin === origin
      } catch {
        return false
      }
    }
    s.setBudget('asset', srcs.filter(sameOrigin).length * 2)
    await pool(srcs, 6, async (src) => {
      try {
        const r = sameOrigin(src)
          ? (await s.run('asset', (signal) => download(src, signal))).value
          : (await download(src, AbortSignal.timeout(20_000))).value
        if ('file' in r) files.set(src, r)
        else imageSkips.push({ url: src.slice(0, 200), why: r.skip })
      } catch (e) {
        imageSkips.push({
          url: src.slice(0, 200),
          why: errorText(e, 20_000),
        })
      }
    })
    stopIfDown('images')
    const fileOf = (src: string) => files.get(src)?.file
    const withFiles = (s: WebSection): WebSection => ({
      ...s,
      images: s.images.map((i) => {
        const f = fileOf(i.src)
        return f ? { ...i, file: f } : i
      }),
      ...(s.repeat && {
        repeat: {
          ...s.repeat,
          items: s.repeat.items.map((i) => {
            const f = i.image ? fileOf(i.image) : undefined
            return f ? { ...i, imageFile: f } : i
          }),
        },
      }),
      ...(s.tree && { tree: mapTree(s.tree, fileOf) }),
    })
    for (const c of collections)
      for (const inst of c.instances) {
        const imgs = inst.fields.images
        if (Array.isArray(imgs))
          inst.fields.images = imgs.map((src) => fileOf(src) ?? src)
      }

    // Mobile pass: kept routes + one sample instance per collection.
    const mobile = await browser.newContext({
      viewport: { width: o.mobileWidth, height: 844 },
      isMobile: true,
      hasTouch: true,
      serviceWorkers: 'block',
    })
    const mobileTargets = [...routePages, ...samples.values()]
    log(
      `mobile renders (${o.mobileWidth}px) for ${mobileTargets.length} page(s)…`,
    )
    const mobileShots = new Map<string, { shot: Buffer; snap: Snapshot }>()
    s.setBudget('mobile', mobileTargets.length * 2)
    await pool(mobileTargets, MAX_CONCURRENCY, async (p) => {
      try {
        await s.run('mobile', async (_signal, timeoutMs) => {
          const { page, status, retryAfter, skip } = await visit(
            mobile,
            p.url,
            timeoutMs,
          )
          try {
            if (!skip) {
              await settle(page)
              const snap = await page.evaluate(snapshotDom)
              mobileShots.set(p.path, {
                snap,
                shot: await shoot(page, lint, `${p.path}@mobile`),
              })
            }
            return { status, retryAfter, value: skip }
          } finally {
            await page.close()
          }
        })
      } catch (e) {
        lint.push({
          level: 'warn',
          node: p.path,
          name: p.path,
          msg: `mobile render failed: ${errorText(e, s.p.timeoutMs)}`,
        })
      }
    })
    stopIfDown('mobile renders')

    // Routes: desktop + mobile pairs sharing a path (pages.ts and dedupeRoutePaths expect that).
    const routes: Array<
      Record<string, unknown> & {
        id: string
        name: string
        path: string
        viewport: 'desktop' | 'mobile'
        render: string
      }
    > = []
    const renders = new Map<string, Buffer>()
    for (const p of routePages) {
      const slug = routeSlug(p.path)
      const render = `design/renders/${slug}.png`
      renders.set(render, p.data.shot)
      if (!p.seg.hasMain)
        lint.push({
          level: 'info',
          node: p.path,
          name: p.path,
          msg: 'page has no <main>; sections were inferred from the body',
        })
      routes.push({
        id: p.path,
        name: routeName(p.path),
        path: p.path,
        url: p.url,
        title: p.data.snap.title,
        ...(p.data.snap.description && {
          description: p.data.snap.description,
        }),
        kind: p.seg.kind,
        page: 'website',
        viewport: 'desktop',
        width: DESKTOP.width,
        height: p.data.snap.height,
        render,
        sections: p.seg.sections.map(withFiles),
        states: [],
      })
      const m = mobileShots.get(p.path)
      if (m) {
        const mRender = `design/renders/${slug}@mobile.png`
        renders.set(mRender, m.shot)
        const mseg = segment(m.snap, `${slug}@m`, 844)
        routes.push({
          id: `${p.path}@mobile`,
          name: routeName(p.path),
          path: p.path,
          kind: mseg.kind,
          page: 'website',
          viewport: 'mobile',
          width: o.mobileWidth,
          height: m.snap.height,
          render: mRender,
          // Layout only: the text and images are the desktop route's.
          sections: mseg.sections.map((s) => ({
            id: s.id,
            name: s.name,
            type: s.type,
            size: s.size,
            box: s.box,
            ...(s.background && { background: s.background }),
            ...(s.layout && { layout: s.layout }),
          })),
          states: [],
        })
      }
    }
    const { renamed, warnings } = dedupeRoutePaths(
      routes.map((r) => ({ path: r.path, viewport: r.viewport, id: r.id })),
    )
    for (const [i, path] of renamed) {
      const r = routes[i]
      if (r) r.path = path
    }
    for (const w of warnings) {
      const r = routes[w.index]
      if (r)
        lint.push({ level: 'warn', node: r.id, name: r.name, msg: w.message })
    }
    for (const [i, render] of dedupeRenders(
      routes.map((r) => ({ render: r.render, id: r.id })),
    )) {
      const r = routes[i]
      const bytes = r ? renders.get(r.render) : undefined
      if (r && bytes) {
        renders.delete(r.render)
        r.render = render
        renders.set(render, bytes)
      }
    }
    // Collection samples: the detail template the agent recreates (its instances are not routes).
    const collectionsOut: Array<
      Collection & { sample?: Record<string, unknown> }
    > = collections.map((c) => {
      const s = samples.get(c.name)
      if (!s) return c
      const slug = `${routeSlug(c.detailRouteShape.replace('/:slug', '')) || 'root'}-detail`
      const render = `design/renders/${slug}.png`
      renders.set(render, s.data.shot)
      const m = mobileShots.get(s.path)
      if (m) renders.set(`design/renders/${slug}@mobile.png`, m.shot)
      return {
        ...c,
        sample: {
          path: s.path,
          kind: s.seg.kind,
          width: DESKTOP.width,
          render,
          ...(m && { renderMobile: `design/renders/${slug}@mobile.png` }),
          sections: s.seg.sections.map(withFiles),
        },
      }
    })
    for (const [file, bytes] of renders) await writeFile(file, bytes)

    // Tokens from computed styles (desktop pages).
    const snaps = pages.map((p) => p.data.snap)
    const pal = palette(snaps)
    const faces = dedupeFonts([
      ...snaps.flatMap((s) => s.fontLinks.flatMap(fontServiceFamilies)),
      ...snaps.flatMap((s) => s.fontFaces),
    ])
    const fontFamilies = [...pal.families.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([family, uses]) => {
        const src = faces.find(
          (f) => cleanFamily(f.family).toLowerCase() === family.toLowerCase(),
        )
        return {
          family,
          uses,
          source: src?.source ?? 'local',
          ...(src?.url && { url: src.url }),
        }
      })
    for (const f of fontFamilies) {
      if (f.source === 'google' || f.source === 'typekit')
        lint.push({
          level: 'info',
          node: 'palette',
          name: f.family,
          msg: `font "${f.family}" is served by ${f.source === 'google' ? 'Google Fonts' : 'Adobe Fonts'}; self-host it (public/fonts) if its licence allows, otherwise substitute and say so`,
        })
      else if (f.source === 'font-face')
        lint.push({
          level: 'warn',
          node: 'palette',
          name: f.family,
          msg: `font "${f.family}" is a webfont (${f.url ?? 'inline'}); the file was not downloaded — get it from the client with a web licence, or substitute and say so`,
        })
    }
    for (const s of imageSkips)
      lint.push({
        level: 'warn',
        node: 'assets',
        name: s.url,
        msg: `image not downloaded: ${s.why}`,
      })

    const images = [...files.entries()].map(([src, f]) => {
      const where = allSections
        .flatMap((s) => s.images)
        .find((i) => i.src === src)
      return {
        file: f.file,
        src,
        alt: where?.alt ?? '',
        bytes: f.bytes,
        ...(where && { size: [where.box[2], where.box[3]] }),
      }
    })
    const siteName =
      snaps.find((s) => s.siteName)?.siteName ||
      siteSuffix ||
      new URL(origin).hostname
    const manifest = {
      fileKey: null,
      fileName: siteName,
      source: {
        kind: 'website',
        url: o.url,
        crawledAt,
        pages: pages.length,
        found: crawled.found,
        fetched: pages.length,
        notFetched: crawled.notFetched,
        attempts: pageAttempts,
        requests: Object.fromEntries(s.used),
        groups: crawled.groups,
        skipped: [
          ...skipped,
          ...(o.ignoreRobots && blocksAll
            ? [
                {
                  url: `${origin}/robots.txt`,
                  why: 'disallows every page; ignored with --ignore-robots (owner override)',
                },
              ]
            : []),
        ],
      },
      version: crawledAt,
      lastModified: crawledAt,
      extractedAt: crawledAt,
      palette: {
        colors: pal.colors,
        fonts: pal.fonts,
        radii: pal.radii,
        spacing: pal.spacing,
        fontFamilies,
      },
      routes,
      collections: collectionsOut,
      images,
      components: [],
      lint,
    }
    await writeFile(
      'design/manifest.json',
      JSON.stringify(manifest, null, 2) + '\n',
    )
    const desktopRoutes = routes.filter((r) => r.viewport === 'desktop')
    log(
      `manifest: ${desktopRoutes.length} route(s) (+${routes.length - desktopRoutes.length} mobile), ${routes.reduce((n, r) => n + (Array.isArray(r.sections) ? r.sections.length : 0), 0)} section(s), ${collections.length} collection(s) [${collections.map((c) => `${c.name}: ${c.instances.length}`).join(', ')}], ${pal.colors.length} colours, ${pal.fonts.length} text styles, ${files.size} image(s), ${skipped.length} skipped, ${lint.length} lint note(s)`,
    )
  } finally {
    await browser.close()
  }
}
