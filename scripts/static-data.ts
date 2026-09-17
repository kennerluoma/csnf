/* Post-build: write loader data as static JSON so client-side navigation never waits on the Worker.
   Runs the built site under `vite preview` (workerd), requests every prerendered page so the
   staticData middleware sees each server-function call, then asks the Worker for what it collected
   and writes it to dist/client/static-data/<hash>.json. See src/lib/staticData.ts. */
import { mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { preview } from 'vite'

const out = 'dist/client'
const pages: Array<string> = []
const walk = (dir: string) => {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f)
    if (statSync(p).isDirectory()) walk(p)
    else if (f === 'index.html')
      pages.push('/' + relative(out, dir).replaceAll('\\', '/'))
  }
}
walk(out)

const server = await preview({
  preview: { port: 0, open: false },
  logLevel: 'warn',
})
const base = server.resolvedUrls?.local[0]?.replace(/\/$/, '')
if (!base) throw new Error('preview server did not start')
try {
  // The header skips the static asset (clean URLs are served from dist) so the route really renders,
  // with exactly the loader input a client-side navigation will send.
  let failed = 0
  for (let i = 0; i < pages.length; i += 8)
    await Promise.all(
      pages.slice(i, i + 8).map(async (p) => {
        const r = await fetch(`${base}${p}`, {
          headers: { 'x-static-data': '1' },
        })
        if (!r.ok) failed++
        await r.arrayBuffer()
      }),
    )
  const data = (await (await fetch(`${base}/__static-data`)).json()) as Record<
    string,
    unknown
  >
  const files = Object.entries(data)
  mkdirSync(join(out, 'static-data'), { recursive: true })
  for (const [url, result] of files)
    writeFileSync(join(out, url), JSON.stringify({ result }))
  console.log(
    `static data: ${files.length} files from ${pages.length} pages${failed ? ` (${failed} pages failed)` : ''}`,
  )
  if (!files.length)
    throw new Error(
      'static data: nothing collected; client navigation would hit the Worker',
    )
} finally {
  await server.close()
}
process.exit(0)
