/* Performance budget, run in CI after the build (`pnpm budget`). "Instant" is a checked property:
   1. JS shipped to the browser stays under the gzip budget.
   2. Clicking internal links on the built site makes no document request and no server-function
      call (the data must come from /static-data), and lands within the click budget.
   Budgets live in package.json → "budgets"; raise them deliberately, in a PR that says why. */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { chromium } from 'playwright'
import { preview } from 'vite'

type Budgets = { jsGzipKB: number; clickMs: number }
const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
  budgets?: Partial<Budgets>
}
const budgets: Budgets = { jsGzipKB: 200, clickMs: 100, ...pkg.budgets }
const problems: Array<string> = []

const assets = 'dist/client/assets'
const jsKB =
  readdirSync(assets)
    .filter((f) => f.endsWith('.js'))
    .reduce((n, f) => n + gzipSync(readFileSync(join(assets, f))).length, 0) /
  1024
console.log(`js: ${jsKB.toFixed(0)} KB gzip (budget ${budgets.jsGzipKB})`)
if (jsKB > budgets.jsGzipKB)
  problems.push(`JS is ${jsKB.toFixed(0)} KB gzip, over ${budgets.jsGzipKB}`)

const server = await preview({
  preview: { port: 0, open: false },
  logLevel: 'warn',
})
const base = server.resolvedUrls?.local[0]?.replace(/\/$/, '')
if (!base) throw new Error('preview server did not start')
const browser = await chromium.launch()
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  // Attached for the whole session, not just around each click: with defaultPreload: 'viewport',
  // a missing static-data file can already trigger its /_serverFn fallback during an earlier
  // page.goto + the viewport-preload wait below, before any click happens — a listener attached
  // only right before a click would miss that, and the click itself (data already fetched by the
  // preload) would then make no further request and silently pass.
  const serverFnCalls: Array<string> = []
  page.on('request', (r) => {
    const u = new URL(r.url())
    if (u.pathname.startsWith('/_serverFn')) serverFnCalls.push(u.pathname)
  })
  await page.goto(base, { waitUntil: 'networkidle' })
  // Index pages linked from the home page, then the first few clean links on each.
  const starts = await page.$$eval('a[href^="/"]', (as) => [
    ...new Set(
      as
        .map((a) => a.getAttribute('href') ?? '')
        .filter((h) => /^\/[a-z0-9-]+$/.test(h)),
    ),
  ])
  let clicks = 0
  for (const start of ['/', ...starts.slice(0, 4)]) {
    await page.goto(base + start, { waitUntil: 'networkidle' })
    await page.waitForTimeout(500) // viewport preloads
    const hrefs = await page.$$eval('main a[href^="/"]', (as) => [
      ...new Set(
        as
          .map((a) => a.getAttribute('href') ?? '')
          .filter((h) => !/[?#.]/.test(h) && !/^\/(api|ics)\//.test(h)),
      ),
    ])
    for (const href of hrefs.filter((h) => h !== start).slice(0, 3)) {
      // /_serverFn is checked for the whole session above; this one stays scoped to the click
      // itself, since a full document reload is specifically about that click, not preloading.
      const bad: Array<string> = []
      const onReq = (r: { resourceType: () => string }) => {
        if (r.resourceType() === 'document') bad.push('document')
      }
      page.on('request', onReq)
      const t0 = Date.now()
      await page
        .locator(`main a[href="${href}"]`)
        .first()
        .click({ noWaitAfter: true })
      await page.waitForURL((u) => u.pathname === href, { waitUntil: 'commit' })
      await page.evaluate(
        () => new Promise((r) => requestAnimationFrame(() => r(null))),
      )
      const ms = Date.now() - t0
      page.off('request', onReq)
      clicks++
      console.log(
        `click ${start} → ${href}: ${ms} ms${bad.length ? ` · ${bad.join(', ')}` : ''}`,
      )
      if (bad.length)
        problems.push(`${start} → ${href} hit the network: ${bad.join(', ')}`)
      if (ms > budgets.clickMs)
        problems.push(
          `${start} → ${href} took ${ms} ms, over ${budgets.clickMs}`,
        )
      await page.goto(base + start, { waitUntil: 'networkidle' })
      await page.waitForTimeout(300)
    }
  }
  // A freshly provisioned site has an empty dataset: one page, nothing to click. That isn't a
  // performance problem; the check starts to bite as soon as there is a second page.
  if (!clicks)
    console.log('click check skipped: the site has no internal links yet')
  if (serverFnCalls.length)
    problems.push(
      `/_serverFn called ${serverFnCalls.length} time(s) during the session: ${[...new Set(serverFnCalls)].join(', ')} — a page is missing its static-data file`,
    )
} finally {
  await browser.close()
  await server.close()
}
if (problems.length) {
  console.error(`\nbudget failed:\n  ${problems.join('\n  ')}`)
  process.exit(1)
}
console.log('budget ok')
process.exit(0)
