/* Custom server entry: ISR on Cloudflare Workers.
   Prerendered routes are static assets and never reach this. Everything else (search-param pages,
   server-function GETs, new slugs) is server-rendered once, stored in the Workers Cache API for the
   `s-maxage` the route asks for, then served from cache; past that window it is served stale while a
   background render refreshes it (`stale-while-revalidate`). Routes opt in with a `headers()` option
   (see __root.tsx). POSTs and responses without a public Cache-Control are never cached. */
import {
  createStartHandler,
  defaultStreamHandler,
  defineHandlerCallback,
} from '@tanstack/react-start/server'
import { createServerEntry } from '@tanstack/react-start/server-entry'

const start = createStartHandler(
  defineHandlerCallback((ctx) => defaultStreamHandler(ctx)),
)

type Ctx = { waitUntil?: (p: Promise<unknown>) => void }
type Env = { ASSETS?: { fetch: (r: Request) => Promise<Response> } }
const STAMP = 'x-isr-rendered-at'

function cachePolicy(res: Response) {
  const cc = res.headers.get('cache-control') ?? ''
  if (!/public/.test(cc)) return null
  const sMax = Number(/s-maxage=(\d+)/.exec(cc)?.[1] ?? 0)
  const swr = Number(/stale-while-revalidate=(\d+)/.exec(cc)?.[1] ?? 0)
  return sMax > 0 ? { sMax, swr } : null
}

async function render(request: Request) {
  const res = await start(request)
  if (request.method !== 'GET' || !res.ok || !cachePolicy(res))
    return { res, store: false }
  const copy = new Response(res.body, res)
  copy.headers.set(STAMP, String(Date.now()))
  return { res: copy, store: true }
}

async function fetch(
  request: Request,
  env?: Env,
  ctx?: Ctx,
): Promise<Response> {
  const url = new URL(request.url)
  // Prerendered pages and public files: only for clean URLs (no query), so filtered/paged variants
  // of a prerendered route still render.
  if (request.method === 'GET' && !url.search && env?.ASSETS) {
    const asset = await env.ASSETS.fetch(request)
    if (asset.status !== 404) return asset
  }
  const cache = (globalThis as unknown as { caches?: { default: Cache } })
    .caches?.default
  if (!cache || request.method !== 'GET') return start(request)
  const key = new Request(request.url, { method: 'GET' })
  const hit = await cache.match(key)
  if (hit) {
    const policy = cachePolicy(hit)
    const age = (Date.now() - Number(hit.headers.get(STAMP) ?? 0)) / 1000
    if (policy && age <= policy.sMax) return withHeader(hit, 'x-isr', 'hit')
    if (policy && age <= policy.sMax + policy.swr) {
      // stale: serve now, refresh in the background
      const refresh = render(request).then(({ res, store }) =>
        store ? cache.put(key, res.clone()) : undefined,
      )
      if (ctx?.waitUntil) ctx.waitUntil(refresh)
      else void refresh
      return withHeader(hit, 'x-isr', 'stale')
    }
  }
  const { res, store } = await render(request)
  if (store) {
    const put = cache.put(key, res.clone())
    if (ctx?.waitUntil) ctx.waitUntil(put)
    else await put
  }
  return withHeader(res, 'x-isr', 'miss')
}

function withHeader(res: Response, name: string, value: string) {
  const out = new Response(res.body, res)
  out.headers.set(name, value)
  return out
}

// Workers call fetch(request, env, ctx); Start's type only knows the first argument.
export default createServerEntry({
  fetch: fetch as unknown as Parameters<typeof createServerEntry>[0]['fetch'],
})
