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

const seen = new Map<string, Promise<{ result: unknown } | null>>()

export const staticData = createMiddleware({ type: 'function' })
  .client(async (ctx) => {
    if (import.meta.env.PROD && typeof document !== 'undefined') {
      const url = await dataUrl(ctx.serverFnMeta.id, ctx.data)
      let hit = seen.get(url)
      if (!hit) {
        hit = fetch(url)
          .then((r) =>
            r.ok && r.headers.get('content-type')?.includes('json')
              ? (r.json() as Promise<{ result: unknown }>)
              : null,
          )
          .catch(() => null)
        seen.set(url, hit)
      }
      const file = await hit
      if (file) return { result: file.result, context: ctx.context } as never
    }
    return ctx.next()
  })
  .server(async (ctx) => {
    const res = await ctx.next()
    // Only under the local preview server that `scripts/static-data.ts` drives after a build: keep
    // every result so the script can write them out as /static-data/<hash>.json.
    if (isLocal(getRequest().url))
      collected().set(
        await dataUrl(ctx.serverFnMeta.id, ctx.data),
        (res as unknown as { result: unknown }).result,
      )
    return res
  })

const isLocal = (url: string) =>
  /^(localhost|127\.0\.0\.1|\[::1\])$/.test(new URL(url).hostname)

/* Results gathered in this isolate (local preview only). Read by src/server.ts → /__static-data. */
export function collected() {
  const g = globalThis as unknown as { __staticData?: Map<string, unknown> }
  return (g.__staticData ??= new Map())
}
