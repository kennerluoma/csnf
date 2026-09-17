/* Visual check: the built pages next to the design renders (`pnpm visual`).
   Words, not gates — this never fails anything. Exit code is 0 unless the script itself crashes.

   Routes, their frame width and their render come from design/manifest.json; design/mapping.json
   turns a route's Figma section ids into the block names the page should render, which the DOM
   reports back through the `data-block` attributes RenderBlocks writes.

   Output:
     design/visual.json          machine-readable, read by `agency status` and the app
     design/visual-report.md     the readable report; open it on the branch and the strips show
     design/visual/<name>.png    render | built strip, for the worst few routes only
     design/shots/<name>.png     the raw screenshots (gitignored)

   A .fig import has no renders. Those routes are reported as "no reference"; nothing is faked. */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { chromium } from 'playwright'
import type { Browser, Page } from 'playwright'
import { preview } from 'vite'

/* Scoring words. score = pixelScore × coverage, both 0–1: how alike the overlapping part is,
   scaled down by how much of the taller image the overlap covers. A page half the design's
   height therefore cannot score above 0.5, which is the point. */
const MATCH = 0.9
const CLOSE = 0.75
/* Both images are compared at a quarter of the design frame's width, so antialiasing, hinting and
   one-pixel nudges are gone before anything is counted. YIQ delta, pixelmatch's formula; 0.2 is
   twice its default tolerance, because a screenshot of a real site is never a render. */
const SCALE = 0.25
const TOLERANCE = 0.2
const STRIPS = 3

type Verdict = 'match' | 'close' | 'different' | 'no reference'
type RouteReport = {
  name: string
  path: string
  viewport: string
  width: number
  verdict: Verdict
  score: number | null
  pixelScore: number | null
  /** Built page height minus design height, as a fraction of the design height. */
  heightDelta: number | null
  render: string | null
  shot: string
  strip: string | null
  blocks: {
    expected: Array<string>
    found: Array<string>
    missing: Array<string>
    extra: Array<string>
  } | null
  note: string | null
}

type Manifest = {
  routes: Array<{
    name: string
    path: string
    viewport?: string
    width?: number
    render?: string
    sections?: Array<{ id: string; type?: string; name?: string }>
  }>
}
type Mapping = { sections?: Record<string, { block?: string }> }

const read = async (file: string): Promise<unknown> =>
  existsSync(file) ? JSON.parse(await readFile(file, 'utf8')) : null

const manifestRaw = await read('design/manifest.json')
if (!manifestRaw) {
  console.log('visual: no design/manifest.json — nothing to compare')
  process.exit(0)
}
const manifest = manifestRaw as Manifest
const mapping = ((await read('design/mapping.json')) ?? {}) as Mapping

const slug = (r: Manifest['routes'][number]) =>
  (r.render
    ?.split('/')
    .pop()
    ?.replace(/\.png$/, '') ??
    (r.path === '/' ? 'home' : r.path.replace(/^\//, '').replace(/\//g, '-'))) +
  (r.viewport === 'mobile' && !r.render ? '-mobile' : '')

await mkdir('design/shots', { recursive: true })
await mkdir('design/visual', { recursive: true })

const server = await preview({
  preview: { port: 0, open: false },
  logLevel: 'warn',
})
const base = server.resolvedUrls?.local[0]?.replace(/\/$/, '')
if (!base) throw new Error('preview server did not start')

const browser = await chromium.launch()
const reports: Array<RouteReport> = []
/* Strips are made for every compared route but only the worst few are written out and committed. */
const strips = new Map<string, string>()
try {
  for (const route of manifest.routes) {
    const { report: r, strip } = await checkRoute(browser, base, route)
    if (strip) strips.set(r.name, strip)
    reports.push(r)
  }
} finally {
  await browser.close()
  await server.close()
}

const worst = reports
  .filter((r) => r.verdict === 'different' || r.verdict === 'close')
  .sort((a, b) => (a.score ?? 1) - (b.score ?? 1))
  .slice(0, STRIPS)
for (const r of worst) {
  const data = strips.get(r.name)
  if (!data) continue
  r.strip = `design/visual/${r.name}.png`
  await writeFile(r.strip, Buffer.from(data.split(',')[1] ?? '', 'base64'))
}

const summary = {
  match: reports.filter((r) => r.verdict === 'match').length,
  close: reports.filter((r) => r.verdict === 'close').length,
  different: reports.filter((r) => r.verdict === 'different').length,
  noReference: reports.filter((r) => r.verdict === 'no reference').length,
}
await writeFile(
  'design/visual.json',
  JSON.stringify(
    { at: new Date().toISOString(), summary, routes: reports },
    null,
    2,
  ) + '\n',
)
await writeFile('design/visual-report.md', report(summary, reports, worst))
console.log(
  `visual: ${summary.match} match · ${summary.close} close · ${summary.different} different · ${summary.noReference} no reference`,
)
for (const r of reports)
  console.log(
    `  ${r.verdict.padEnd(12)} ${r.path}${r.viewport === 'mobile' ? ' (mobile)' : ''}` +
      (r.score === null ? '' : ` ${(r.score * 100).toFixed(0)}%`) +
      (r.note ? `  ${r.note}` : ''),
  )

async function checkRoute(
  b: Browser,
  origin: string,
  route: Manifest['routes'][number],
): Promise<{ report: RouteReport; strip: string | null }> {
  const width = route.width || (route.viewport === 'mobile' ? 390 : 1440)
  const name = slug(route)
  const shot = `design/shots/${name}.png`
  const page: Page = await b.newPage({ viewport: { width, height: 900 } })
  let note: string | null = null
  try {
    const res = await page.goto(origin + route.path, {
      waitUntil: 'networkidle',
    })
    if (res && res.status() >= 400) note = `route returned HTTP ${res.status()}`
    await page.screenshot({ path: shot, fullPage: true })
    const found = await page.$$eval('[data-block]', (els) =>
      els.map((e) => e.getAttribute('data-block') ?? ''),
    )
    const expected = (route.sections ?? [])
      .map((s) => mapping.sections?.[s.id]?.block)
      .filter((x): x is string => !!x)
    const blocks =
      expected.length || found.length ? diffBlocks(expected, found) : null

    const render =
      route.render && existsSync(route.render) ? route.render : null
    if (!render)
      return {
        report: {
          name,
          path: route.path,
          viewport: route.viewport ?? 'desktop',
          width,
          verdict: 'no reference',
          score: null,
          pixelScore: null,
          heightDelta: null,
          render: null,
          shot,
          strip: null,
          blocks,
          note:
            note ??
            'no design render (a .fig import has none; the Figma plugin export does)',
        },
        strip: null,
      }

    const cmp = await compare(page, render, shot, Math.round(width * SCALE))
    const verdict: Verdict =
      cmp.score >= MATCH ? 'match' : cmp.score >= CLOSE ? 'close' : 'different'
    return {
      report: {
        name,
        path: route.path,
        viewport: route.viewport ?? 'desktop',
        width,
        verdict,
        score: cmp.score,
        pixelScore: cmp.pixelScore,
        heightDelta: cmp.heightDelta,
        render,
        shot,
        strip: null,
        blocks,
        note,
      },
      strip: cmp.strip,
    }
  } catch (e) {
    return {
      report: {
        name,
        path: route.path,
        viewport: route.viewport ?? 'desktop',
        width,
        verdict: 'no reference',
        score: null,
        pixelScore: null,
        heightDelta: null,
        render: null,
        shot,
        strip: null,
        blocks: null,
        note: `could not check: ${e instanceof Error ? e.message : String(e)}`,
      },
      strip: null,
    }
  } finally {
    await page.close()
  }
}

/* `expected` is empty when the route has no mapped blocks (a `screen` route, or a project with no
   design/mapping.json yet); then nothing can be missing or extra, only what rendered. */
function diffBlocks(expected: Array<string>, found: Array<string>) {
  if (!expected.length) return { expected, found, missing: [], extra: [] }
  const count = (xs: Array<string>) => {
    const m = new Map<string, number>()
    for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1)
    return m
  }
  const e = count(expected)
  const f = count(found)
  const missing: Array<string> = []
  const extra: Array<string> = []
  for (const [k, n] of e)
    for (let i = 0; i < n - (f.get(k) ?? 0); i++) missing.push(k)
  for (const [k, n] of f)
    for (let i = 0; i < n - (e.get(k) ?? 0); i++) extra.push(k)
  return { expected, found, missing, extra }
}

/* Both PNGs go into the page as data: URLs (which don't taint the canvas), get drawn at the same
   width, and are compared over the height they share. Doing it in the browser keeps the template
   free of an image-decoding dependency; Playwright is already here for `pnpm budget`. */
async function compare(
  page: Page,
  renderFile: string,
  shotFile: string,
  width: number,
) {
  const [a, b] = await Promise.all([dataUrl(renderFile), dataUrl(shotFile)])
  await page.goto('about:blank')
  return page.evaluate(
    async ([renderUrl, shotUrl, w, tolerance]: [
      string,
      string,
      number,
      number,
    ]) => {
      const load = (src: string) =>
        new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image()
          img.onload = () => resolve(img)
          img.onerror = () => reject(new Error('image failed to load'))
          img.src = src
        })
      const draw = (img: HTMLImageElement) => {
        const h = Math.max(
          1,
          Math.round((img.naturalHeight * w) / img.naturalWidth),
        )
        const c = document.createElement('canvas')
        c.width = w
        c.height = h
        const ctx = c.getContext('2d')
        if (!ctx) throw new Error('no 2d context')
        ctx.fillStyle = '#fff'
        ctx.fillRect(0, 0, w, h)
        ctx.drawImage(img, 0, 0, w, h)
        return { canvas: c, ctx, h }
      }
      const [ri, si] = await Promise.all([load(renderUrl), load(shotUrl)])
      const r = draw(ri)
      const s = draw(si)
      const h = Math.min(r.h, s.h)
      const rd = r.ctx.getImageData(0, 0, w, h).data
      const sd = s.ctx.getImageData(0, 0, w, h).data
      // pixelmatch's YIQ delta; maxDelta 35215 is its full-scale constant.
      const maxDelta = 35215 * tolerance * tolerance
      let same = 0
      for (let i = 0; i < rd.length; i += 4) {
        const dr = rd[i]! - sd[i]!
        const dg = rd[i + 1]! - sd[i + 1]!
        const db = rd[i + 2]! - sd[i + 2]!
        const y = dr * 0.29889531 + dg * 0.58662247 + db * 0.11448223
        const q = dr * 0.59597799 - dg * 0.2741761 - db * 0.32180189
        const v = dr * 0.21147017 - dg * 0.52261711 + db * 0.31114694
        if (0.5053 * y * y + 0.299 * q * q + 0.1957 * v * v <= maxDelta) same++
      }
      const pixelScore = same / (w * h)
      const coverage = Math.min(r.h, s.h) / Math.max(r.h, s.h)

      // render | built, side by side, for the report.
      const gap = 8
      const strip = document.createElement('canvas')
      strip.width = w * 2 + gap
      strip.height = Math.max(r.h, s.h)
      const sc = strip.getContext('2d')
      if (!sc) throw new Error('no 2d context')
      sc.fillStyle = '#fff'
      sc.fillRect(0, 0, strip.width, strip.height)
      sc.drawImage(r.canvas, 0, 0)
      sc.drawImage(s.canvas, w + gap, 0)

      return {
        pixelScore,
        score: pixelScore * coverage,
        heightDelta: (s.h - r.h) / r.h,
        strip: strip.toDataURL('image/png'),
      }
    },
    [a, b, width, TOLERANCE] as [string, string, number, number],
  )
}

async function dataUrl(file: string) {
  return `data:image/png;base64,${(await readFile(file)).toString('base64')}`
}

function pct(n: number | null) {
  return n === null ? '—' : `${(n * 100).toFixed(0)}%`
}
function signed(n: number | null) {
  return n === null ? '—' : `${n >= 0 ? '+' : ''}${(n * 100).toFixed(0)}%`
}

function blockWord(b: RouteReport['blocks']) {
  if (!b) return '—'
  if (!b.expected.length)
    return b.found.length ? `${b.found.length} rendered` : '—'
  if (!b.found.length) return 'no `data-block` markers (needs `agency refresh`)'
  if (!b.missing.length && !b.extra.length)
    return `${b.found.length} as planned`
  return [
    b.missing.length ? `missing \`${b.missing.join('`, `')}\`` : '',
    b.extra.length ? `extra \`${b.extra.join('`, `')}\`` : '',
  ]
    .filter(Boolean)
    .join(' · ')
}

function report(
  summary: {
    match: number
    close: number
    different: number
    noReference: number
  },
  rows: Array<RouteReport>,
  worst: Array<RouteReport>,
) {
  const lines: Array<string> = []
  lines.push('# Visual check', '')
  lines.push(
    `${summary.match} match · ${summary.close} close · ${summary.different} different · ${summary.noReference} no reference`,
    '',
  )
  lines.push(
    'Each page is screenshotted at its design frame width and compared with the Figma render at a',
    'quarter size. `score` is how alike the overlapping part is, scaled by how much of the taller',
    'image that overlap covers, so a page much shorter or longer than the design cannot score high.',
    '**Nothing here fails a check** — small differences are expected, and in `normalised` fidelity',
    'differences inside the snapped tolerances are not defects.',
    '',
  )
  lines.push(
    '| Route | Viewport | Verdict | Score | Height vs design | Blocks |',
  )
  lines.push('| --- | --- | --- | --- | --- | --- |')
  for (const r of rows) {
    const blocks = blockWord(r.blocks)
    lines.push(
      `| \`${r.path}\` | ${r.viewport} | ${r.verdict} | ${pct(r.score)} | ${signed(r.heightDelta)} | ${blocks} |`,
    )
  }
  lines.push('')
  const notes = rows.filter((r) => r.note)
  if (notes.length) {
    lines.push('## Notes', '')
    for (const r of notes) lines.push(`- \`${r.path}\` — ${r.note}`)
    lines.push('')
  }
  if (worst.length) {
    lines.push(
      '## Furthest from the design',
      '',
      '_Left: the Figma render. Right: the built page._',
      '',
    )
    for (const r of worst) {
      lines.push(`### \`${r.path}\` — ${r.verdict}, ${pct(r.score)}`, '')
      if (r.strip)
        lines.push(`![${r.path}](${r.strip.replace('design/', '')})`, '')
    }
  }
  return lines.join('\n') + '\n'
}
