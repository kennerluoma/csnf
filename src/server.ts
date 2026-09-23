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
import { collected } from '#/lib/staticData'
import { extendForStaleWindow, isrStatus, parsePolicy } from '#/lib/isr-cache'
import { redirectFor, redirectTable } from '#/lib/redirects'

// Written by a content import (`pnpm run import`); a glob, so a project without the file builds.
const redirects = redirectTable(
  Object.values(
    import.meta.glob<unknown>('../design/redirects.json', {
      eager: true,
      import: 'default',
    }),
  )[0],
)

const start = createStartHandler(
  defineHandlerCallback((ctx) => defaultStreamHandler(ctx)),
)

type Ctx = { waitUntil?: (p: Promise<unknown>) => void }
type Env = { ASSETS?: { fetch: (r: Request) => Promise<Response> } }
const STAMP = 'x-isr-rendered-at'
// The Workers Cache API only honours s-maxage for its own expiry and has no idea what
// stale-while-revalidate means, so a stored entry whose Cache-Control still says `s-maxage=60`
// becomes a cache miss after 60s regardless of the swr window — the "stale: serve now, refresh in
// the background" branch below was never reachable. The entry's stored Cache-Control is rewritten
// to survive the full sMax+swr window instead; the *original* policy (what callers were actually
// promised) travels in this header and is restored on every reply.
const POLICY_HEADER = 'x-isr-policy'

async function render(request: Request) {
  const res = await start(request)
  const cacheControl = res.headers.get('cache-control')
  const policy =
    request.method === 'GET' && res.ok ? parsePolicy(cacheControl) : null
  if (!policy || !cacheControl) return { res, store: false }
  const copy = new Response(res.body, res)
  copy.headers.set(STAMP, String(Date.now()))
  copy.headers.set(POLICY_HEADER, cacheControl)
  copy.headers.set('cache-control', extendForStaleWindow(cacheControl, policy))
  return { res: copy, store: true }
}

/* Restore the Cache-Control callers were actually promised (not the extended one an entry is
   stored under), drop the internal bookkeeping headers, and stamp how this reply was served. */
function reply(res: Response, isrStatus: string) {
  const out = new Response(res.body, res)
  const original = out.headers.get(POLICY_HEADER)
  if (original) out.headers.set('cache-control', original)
  out.headers.delete(POLICY_HEADER)
  out.headers.delete(STAMP)
  out.headers.set('x-isr', isrStatus)
  return out
}

async function fetch(
  request: Request,
  env?: Env,
  ctx?: Ctx,
): Promise<Response> {
  const url = new URL(request.url)
  // Build step only (scripts/static-data.ts, local preview): hand over the collected loader data.
  if (url.pathname === '/__static-data')
    return /^(localhost|127\.0\.0\.1)$/.test(url.hostname)
      ? Response.json(Object.fromEntries(collected()))
      : new Response(null, { status: 404 })
  // The imported site's old URLs keep working: 301 to where that content lives now.
  if (request.method === 'GET' || request.method === 'HEAD') {
    const to = redirectFor(redirects, url.pathname)
    if (to)
      return new Response(null, {
        status: 301,
        headers: { location: new URL(to + url.search, url).href },
      })
  }
  // A data file that wasn't prebuilt: answer cheaply, the client falls back to the server function.
  if (url.pathname.startsWith('/static-data/'))
    return new Response(null, { status: 404 })
  // Prerendered pages and public files: only for clean URLs (no query), so filtered/paged variants
  // of a prerendered route still render.
  if (
    request.method === 'GET' &&
    !url.search &&
    env?.ASSETS &&
    !request.headers.has('x-static-data') // the build script wants the route rendered, not the file
  ) {
    const asset = await env.ASSETS.fetch(request)
    if (asset.status !== 404) return asset
  }
  const cache = typeof caches === 'undefined' ? undefined : caches.default
  // Router data requests (client-side navigation) carry their own payload in the query; never cache them.
  if (
    !cache ||
    request.method !== 'GET' ||
    url.pathname.startsWith('/_serverFn')
  )
    return start(request)
  // The cache key carries the build id: once a stale entry can actually be served (below), it can
  // outlive its own deploy by up to the swr window, and day-old HTML must not reference hashed
  // /assets/* files a newer deploy already removed. A new deploy's first request for a URL is
  // therefore always a miss, never a hit against a previous build's entry.
  const key = new Request(`${request.url}#${__BUILD_ID__}`, { method: 'GET' })
  const hit = await cache.match(key)
  if (hit) {
    const policy = parsePolicy(hit.headers.get(POLICY_HEADER))
    const age = (Date.now() - Number(hit.headers.get(STAMP) ?? 0)) / 1000
    const status = isrStatus(policy, age)
    if (status === 'fresh') return reply(hit, 'hit')
    if (status === 'stale') {
      // serve now, refresh in the background
      const refresh = render(request).then(({ res, store }) =>
        store ? cache.put(key, res.clone()) : undefined,
      )
      if (ctx?.waitUntil) ctx.waitUntil(refresh)
      else void refresh
      return reply(hit, 'stale')
    }
  }
  const { res, store } = await render(request)
  if (store) {
    const put = cache.put(key, res.clone())
    if (ctx?.waitUntil) ctx.waitUntil(put)
    else await put
  }
  return reply(res, 'miss')
}

/* Workers call fetch(request, env, ctx). Start's `createServerEntry` is a pass-through wrapper whose
   type only knows the first argument, so the entry is exported as the plain Workers module it is. */
export default { fetch }
