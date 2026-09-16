/* Screenshot routes from a running site for visual comparison against design/renders.
   Run: pnpm shot [baseUrl]   (default http://localhost:3000). Writes design/shots/<slug>.png
   Routes come from design/manifest.json. Viewport 1440 wide, full page. */
import { mkdir, readFile } from 'node:fs/promises'
import { chromium } from 'playwright'

const base = process.argv[2] ?? 'http://localhost:3000'
const manifest = JSON.parse(await readFile('design/manifest.json', 'utf8')) as {
  routes: Array<{
    name: string
    path: string
    viewport: string
    width: number
    render: string
  }>
}
await mkdir('design/shots', { recursive: true })
const browser = await chromium.launch()
for (const r of manifest.routes) {
  const page = await browser.newPage({
    viewport: { width: r.width || 1440, height: 900 },
  })
  await page.goto(base + r.path, { waitUntil: 'networkidle' })
  const out = r.render.replace('design/renders/', 'design/shots/')
  await page.screenshot({ path: out, fullPage: true })
  console.log(`${r.path} → ${out}   (compare with ${r.render})`)
  await page.close()
}
await browser.close()
