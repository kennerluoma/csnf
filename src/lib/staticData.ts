import { createMiddleware } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'

/* Instant client-side navigation. Prerendering makes the first page static, but a route loader
   still calls its server function on every in-app click (browser → Worker → Sanity). This
   middleware closes that gap the way a static export does:

   - after the build, `scripts/static-data.ts` renders every prerendered page once more under the
     local preview server and writes each server function result to /static-data/<hash>.json
     next to the HTML (the prerender itself runs inside workerd, which cannot write files);
   - in the browser, the loader reads that file (a CDN asset, no Worker, no Sanity) instead of calling
     the function. If there is no file (a query-string URL, content newer than the build), it falls
     through to the real call, which the ISR layer answers.

   Same idea as @tanstack/start-static-server-functions, plus the fallback; results here are plain
   JSON, so no serialiser is needed. */

const hash = async (s: string) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest('SHA-1', new TextEncoder().encode(s)),
    ),
  )
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')

const stable = (v: unknown): unknown =>
  Array.isArray(v)
    ? v.map(stable)
    : v && typeof v === 'object'
      ? Object.fromEntries(
          Object.entries(v)
            .filter(([, x]) => x !== undefined)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, x]) => [k, stable(x)]),
        )
      : v

export const dataUrl = async (id: string, data: unknown) =>
  `/static-data/${await hash(`${id}:${JSON.stringify(stable(data ?? null))}`)}.json`

type DataFile = { result: unknown }
const isDataFile = (v: unknown): v is DataFile =>
  typeof v === 'object' && v !== null && 'result' in v
const readDataFile = async (r: Response): Promise<DataFile | null> => {
  if (!r.ok || !r.headers.get('content-type')?.includes('json')) return null
  const body: unknown = await r.json()
  return isDataFile(body) ? body : null
}

/* Start types a middleware result as an opaque brand that only `next()` can produce. Answering from
   the prebuilt file instead of calling next() is what the runtime supports (it is how
   @tanstack/start-static-server-functions works) but the types cannot express it, so this is the one
   place the result is asserted. `T` is the type of `await ctx.next()`. */
function answerWithout<T>(result: unknown, context: unknown): T {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Start's middleware result type is a brand only next() returns; see above
  return { result, context } as T
}

const seen = new Map<string, Promise<DataFile | null>>()

export const staticData = createMiddleware({ type: 'function' })
  .client(async (ctx) => {
    if (import.meta.env.PROD && typeof document !== 'undefined') {
      const url = await dataUrl(ctx.serverFnMeta.id, ctx.data)
      let hit = seen.get(url)
      if (!hit) {
        hit = fetch(url)
          .then(readDataFile)
          .catch(() => null)
        seen.set(url, hit)
      }
      const file = await hit
      if (file)
        return answerWithout<
          Awaited<ReturnType<typeof ctx.next<undefined, undefined>>>
        >(file.result, ctx.context)
    }
    return ctx.next()
  })
  .server(async (ctx) => {
    const res = await ctx.next()
    // Only under the local preview server that `scripts/static-data.ts` drives after a build: keep
    // every result so the script can write them out as /static-data/<hash>.json.
    // (the result type is an opaque brand; at runtime it carries the handler's `result`)
    if (isLocal(getRequest().url) && 'result' in res)
      collected().set(await dataUrl(ctx.serverFnMeta.id, ctx.data), res.result)
    return res
  })

const isLocal = (url: string) =>
  /^(localhost|127\.0\.0\.1|\[::1\])$/.test(new URL(url).hostname)

/* Results gathered in this isolate (local preview only). Read by src/server.ts → /__static-data. */
export function collected() {
  return (globalThis.__staticData ??= new Map<string, unknown>())
}
