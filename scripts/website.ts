/* A live website → design/manifest.json + design/renders/* + design/assets/* (the same files the
   Figma extractor writes). Run through extract.ts:
     pnpm extract --from-url <url> [--max-pages 30] [--only /a,/b] [--mobile-width 390]
     pnpm extract --from-url <url> --inspect [--json]      (HTML only, no browser, a few seconds)
   Only for the client's own site or with permission; the origin is recorded in the manifest.
   Same-origin pages only, robots.txt respected (`--ignore-robots` only for a site you own whose
   robots.txt blocks everything, e.g. a noindex preview), webfont files never downloaded.
   Everything that is not I/O lives in ./website-lib.ts. */
import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import type { Browser, BrowserContext, Page } from 'playwright'
import {
  classifyUrl,
  cleanFamily,
  coloursInCss,
  commonTitleSuffix,
  detectCollections,
  dirOf,
  fontFacesInCss,
  fontServiceFamilies,
  htmlImages,
  htmlInlineStyles,
  htmlLinks,
  htmlStylesheets,
  htmlTitle,
  LOGIN_PATH,
  parseRobots,
  parseSitemap,
  robotsAllows,
  routeName,
  routeSlug,
  segment,
  snapshotDom,
  snapshotLinks,
  withoutQuery,
} from './website-lib.ts'
import type {
  Collection,
  CrawledPage,
  FontSource,
  FoundLink,
  Robots,
  Snapshot,
  SnapNode,
  TreeNode,
  WebSection,
} from './website-lib.ts'
import { dedupeRenders, dedupeRoutePaths } from './route-key.ts'

const USER_AGENT =
  'Mozilla/5.0 (compatible; Kiln/1.0; +https://github.com/kennerluoma/csnf) website recreation'
const DESKTOP = { width: 1440, height: 900 }
const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const IMAGE_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
  'image/avif': 'avif',
}
const log = (...a: Array<unknown>) => console.error(...a)

type Skip = { url: string; why: string }
type Options = {
  url: string
  maxPages: number
  only: Array<string> | undefined
  mobileWidth: number
  inspect: boolean
  json: boolean
  ignoreRobots: boolean
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
  }
}

async function get(url: string, timeoutMs = 8000) {
  return fetch(url, {
    headers: { 'user-agent': USER_AGENT, accept: 'text/html,*/*;q=0.8' },
    redirect: 'follow',
    signal: AbortSignal.timeout(timeoutMs),
  })
}
async function text(
  url: string,
  timeoutMs = 8000,
): Promise<string | undefined> {
  try {
    const res = await get(url, timeoutMs)
    return res.ok ? await res.text() : undefined
  } catch {
    return undefined
  }
}

// ---- robots + sitemap ----

async function siteRules(origin: string, ignoreRobots: boolean) {
  const robotsTxt = (await text(`${origin}/robots.txt`)) ?? ''
  const parsed = parseRobots(robotsTxt)
  const robots: Robots = ignoreRobots
    ? { rules: [], sitemaps: parsed.sitemaps }
    : parsed
  const sitemapUrls: Array<string> = []
  const queue = [...new Set([...parsed.sitemaps, `${origin}/sitemap.xml`])]
  for (let i = 0; i < queue.length && i < 6; i++) {
    const sm = queue[i]
    if (!sm || !sm.startsWith(origin)) continue
    const xml = await text(sm)
    if (!xml) continue
    const { urls, sitemaps } = parseSitemap(xml)
    sitemapUrls.push(...urls)
    for (const s of sitemaps) if (!queue.includes(s)) queue.push(s)
  }
  return { robots, sitemapUrls, blocksAll: !robotsAllows(parsed, '/') }
}

// ---- crawl ----

type Loaded<T> =
  | { kind: 'page'; finalUrl: string; links: Array<FoundLink>; data: T }
  | { kind: 'skip'; why: string }

/* Priority crawl: the start page, then nav/header/footer links, then in-page links, then the
   sitemap; siblings under a parent path that already has 8 queued pages wait at the back so a blog
   with 300 posts cannot eat the page budget before the About page is reached. */
async function crawl<T>(o: {
  origin: string
  seeds: Array<string>
  sitemap: Array<string>
  discover: boolean
  max: number
  robots: Robots
  concurrency: number
  load: (url: string) => Promise<Loaded<T>>
}) {
  type Job = { url: string; tier: number; seq: number }
  const queue: Array<Job> = []
  const seen = new Set<string>()
  const done = new Set<string>()
  const skipped = new Map<string, string>()
  const perDir = new Map<string, number>()
  const pages: Array<{ url: string; path: string; data: T }> = []
  let seq = 0
  const skip = (url: string, why: string) => {
    if (!skipped.has(url)) skipped.set(url, why)
  }
  const enqueue = (href: string, base: string, tier: number) => {
    const v = classifyUrl(href, base, o.origin)
    if (!v.ok) {
      if (v.why === 'off-origin' || v.why === 'invalid URL') return
      skip(v.url, v.why)
      if (v.why === 'query variant') enqueue(withoutQuery(v.url), base, tier)
      return
    }
    if (seen.has(v.url)) return
    seen.add(v.url)
    if (!robotsAllows(o.robots, v.path)) {
      skip(v.url, 'robots.txt disallows')
      return
    }
    const dir = dirOf(v.path)
    const n = (perDir.get(dir) ?? 0) + 1
    perDir.set(dir, n)
    queue.push({
      url: v.url,
      tier: dir !== '/' && n > 8 ? Math.max(tier, 4) : tier,
      seq: seq++,
    })
  }
  for (const s of o.seeds) enqueue(s, o.origin, 0)
  if (o.discover) for (const s of o.sitemap) enqueue(s, o.origin, 3)
  const pop = () => {
    let best = 0
    queue.forEach((j, i) => {
      const b = queue[best]
      if (b && (j.tier < b.tier || (j.tier === b.tier && j.seq < b.seq)))
        best = i
    })
    return queue.splice(best, 1)[0]
  }
  const run = async (job: Job) => {
    let res: Loaded<T>
    try {
      res = await o.load(job.url)
    } catch (e) {
      skip(
        job.url,
        `error: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`,
      )
      return
    }
    if (res.kind === 'skip') {
      skip(job.url, res.why)
      return
    }
    const final = classifyUrl(res.finalUrl, job.url, o.origin)
    if (!final.ok) {
      skip(
        job.url,
        final.why === 'off-origin'
          ? 'redirects off-origin'
          : `redirects to ${final.why}`,
      )
      return
    }
    if (done.has(final.url)) {
      if (final.url !== job.url) skip(job.url, `redirects to ${final.path}`)
      return
    }
    if (pages.length >= o.max) return
    done.add(final.url)
    seen.add(final.url)
    pages.push({ url: final.url, path: final.path, data: res.data })
    if (o.discover)
      for (const l of res.links)
        enqueue(l.href, final.url, l.zone === 'nav' ? 1 : 2)
  }
  const running = new Set<Promise<void>>()
  for (;;) {
    while (
      running.size < o.concurrency &&
      queue.length &&
      pages.length + running.size < o.max
    ) {
      const job = pop()
      if (!job) break
      const p: Promise<void> = run(job).finally(() => running.delete(p))
      running.add(p)
    }
    if (!running.size) break
    await Promise.race(running)
  }
  for (const j of queue) skip(j.url, `over --max-pages ${o.max}`)
  pages.sort((a, b) =>
    a.path === '/' ? -1 : b.path === '/' ? 1 : a.path.localeCompare(b.path),
  )
  return {
    pages,
    skipped: [...skipped.entries()].map(([url, why]) => ({ url, why })),
  }
}

function responseSkip(
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

export async function inspect(o: Options) {
  const origin = new URL(o.url).origin
  const { robots, sitemapUrls, blocksAll } = await siteRules(
    origin,
    o.ignoreRobots,
  )
  const { pages, skipped } = await crawl<InspectPage>({
    origin,
    seeds: o.only ? o.only.map((p) => origin + p) : [o.url],
    sitemap: sitemapUrls,
    discover: !o.only,
    max: o.only ? o.only.length : o.maxPages,
    robots,
    concurrency: 8,
    load: async (url) => {
      const res = await get(url, 6000)
      const why = responseSkip(
        res.status,
        res.url,
        res.headers.get('content-type') ?? '',
      )
      if (why) {
        await res.body?.cancel()
        return { kind: 'skip', why }
      }
      const html = await res.text()
      const css = htmlStylesheets(html, res.url)
      return {
        kind: 'page',
        finalUrl: res.url,
        links: htmlLinks(html),
        data: {
          path: new URL(res.url).pathname,
          title: htmlTitle(html),
          images: htmlImages(html, res.url).slice(0, 4),
          css: css.filter((c) => c.startsWith(origin)),
          inline: htmlInlineStyles(html),
          fontLinks: css.filter((c) => fontServiceFamilies(c).length),
        },
      }
    },
  })
  // Fonts and colours: the site's own stylesheets (first few) + inline <style>, never font files.
  const cssUrls = [...new Set(pages.flatMap((p) => p.data.css))].slice(0, 6)
  const sheets = await Promise.all(
    cssUrls.map(async (u) => ({ u, css: (await text(u, 5000)) ?? '' })),
  )
  const inline = [...new Set(pages.flatMap((p) => p.data.inline))]
  const fonts = dedupeFonts([
    ...[...new Set(pages.flatMap((p) => p.data.fontLinks))].flatMap(
      fontServiceFamilies,
    ),
    ...sheets.flatMap((s) => fontFacesInCss(s.css, s.u)),
    ...inline.flatMap((css) => fontFacesInCss(css, origin)),
  ])
  const colourCounts = new Map<string, number>()
  for (const css of [...sheets.map((s) => s.css), ...inline])
    for (const c of coloursInCss(css))
      colourCounts.set(c.hex, (colourCounts.get(c.hex) ?? 0) + c.uses)
  const colours = [...colourCounts.entries()]
    .map(([hex, uses]) => ({ hex, uses }))
    .sort((a, b) => b.uses - a.uses)
    .slice(0, 16)
  const result = {
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
            ...skipped,
          ]
        : skipped,
  }
  if (o.json) {
    process.stdout.write(JSON.stringify(result) + '\n')
    return
  }
  console.log(`${o.url}: ${result.pages.length} page(s)`)
  for (const p of result.pages)
    console.log(`  ${p.path}  ${p.title}  (${p.images.length} image(s))`)
  console.log(
    `fonts: ${fonts.map((f) => `${f.family} [${f.source}]`).join(', ') || 'none found'}`,
  )
  console.log(`colours: ${colours.map((c) => c.hex).join(' ')}`)
  if (result.skipped.length) {
    console.log(`skipped ${result.skipped.length}:`)
    for (const s of result.skipped.slice(0, 40))
      console.log(`  ${s.url}  (${s.why})`)
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

async function visit(
  ctx: BrowserContext,
  url: string,
): Promise<{ page: Page; skip?: string }> {
  const page = await ctx.newPage()
  const res = await page.goto(url, {
    waitUntil: 'domcontentloaded',
    timeout: 30_000,
  })
  if (!res) return { page, skip: 'no response' }
  const why = responseSkip(
    res.status(),
    page.url(),
    res.headers()['content-type'] ?? '',
  )
  return why ? { page, skip: why } : { page }
}

async function download(
  src: string,
): Promise<{ file: string; bytes: number } | { skip: string }> {
  let bytes: Buffer
  let type = ''
  if (src.startsWith('data:')) {
    const m = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(src)
    if (!m) return { skip: 'unreadable data: URI' }
    type = m[1] ?? ''
    bytes = m[2]
      ? Buffer.from(m[3] ?? '', 'base64')
      : Buffer.from(decodeURIComponent(m[3] ?? ''))
    if (bytes.length < 2048) return { skip: 'placeholder (tiny data: URI)' }
  } else {
    const res = await fetch(src, {
      // Ask for modern formats: image CDNs (Sanity, Imgix, Cloudinary) then send WebP (Sanity takes it; AVIF it may not).
      headers: {
        'user-agent': USER_AGENT,
        accept: 'image/webp,image/*;q=0.8',
      },
      signal: AbortSignal.timeout(20_000),
    })
    if (!res.ok || !res.body) return { skip: `HTTP ${res.status}` }
    type = res.headers.get('content-type') ?? ''
    if (!type.startsWith('image/')) {
      await res.body.cancel()
      return { skip: `not an image (${type || 'no type'})` }
    }
    if (Number(res.headers.get('content-length') ?? 0) > MAX_IMAGE_BYTES) {
      await res.body.cancel()
      return { skip: 'over 10 MB' }
    }
    const chunks: Array<Uint8Array> = []
    let size = 0
    const reader = res.body.getReader()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > MAX_IMAGE_BYTES) {
        await reader.cancel()
        return { skip: 'over 10 MB' }
      }
      chunks.push(value)
    }
    bytes = Buffer.concat(chunks)
  }
  const ext = IMAGE_EXT[type.split(';')[0]?.trim() ?? ''] ?? 'img'
  const file = `design/assets/${createHash('sha256').update(bytes).digest('hex').slice(0, 16)}.${ext}`
  await writeFile(file, bytes)
  return { file, bytes: bytes.length }
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
  const { robots, sitemapUrls, blocksAll } = await siteRules(
    origin,
    o.ignoreRobots,
  )
  const { chromium } = await import('playwright')
  const browser: Browser = await chromium.launch()
  try {
    const desktop = await browser.newContext({
      viewport: DESKTOP,
      serviceWorkers: 'block',
    })
    log(
      `crawling ${origin} (max ${o.only ? o.only.length : o.maxPages} page(s))…`,
    )
    const { pages, skipped } = await crawl<Captured>({
      origin,
      seeds: o.only ? o.only.map((p) => origin + p) : [o.url],
      sitemap: sitemapUrls,
      discover: !o.only,
      max: o.only ? o.only.length : o.maxPages,
      robots,
      concurrency: 3,
      load: async (url) => {
        const { page, skip } = await visit(desktop, url)
        try {
          if (skip) return { kind: 'skip', why: skip }
          await settle(page)
          const snap = await page.evaluate(snapshotDom)
          const shot = await shoot(page, lint, new URL(page.url()).pathname)
          log(`  ${new URL(page.url()).pathname}`)
          return {
            kind: 'page',
            finalUrl: page.url(),
            links: snapshotLinks(snap.root),
            data: { snap, shot },
          }
        } finally {
          await page.close()
        }
      },
    })
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
    const crawled: Array<CrawledPage> = segmented.map((p) => ({
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
      crawled,
      origin,
      siteSuffix,
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
    await pool(srcs, 6, async (src) => {
      try {
        const r = await download(src)
        if ('file' in r) files.set(src, r)
        else imageSkips.push({ url: src.slice(0, 200), why: r.skip })
      } catch (e) {
        imageSkips.push({
          url: src.slice(0, 200),
          why: e instanceof Error ? e.message : String(e),
        })
      }
    })
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
    await pool(mobileTargets, 3, async (p) => {
      const { page, skip } = await visit(mobile, p.url)
      try {
        if (skip) return
        await settle(page)
        const snap = await page.evaluate(snapshotDom)
        mobileShots.set(p.path, {
          snap,
          shot: await shoot(page, lint, `${p.path}@mobile`),
        })
      } catch (e) {
        lint.push({
          level: 'warn',
          node: p.path,
          name: p.path,
          msg: `mobile render failed: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`,
        })
      } finally {
        await page.close()
      }
    })

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
