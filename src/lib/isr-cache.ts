/* Pure Cache-Control parsing/rewriting for src/server.ts's ISR cache, pulled out for testing. */

export type CachePolicy = { sMax: number; swr: number }

export function parsePolicy(cacheControl: string | null): CachePolicy | null {
  const cc = cacheControl ?? ''
  if (!/public/.test(cc)) return null
  const sMax = Number(/s-maxage=(\d+)/.exec(cc)?.[1] ?? 0)
  const swr = Number(/stale-while-revalidate=(\d+)/.exec(cc)?.[1] ?? 0)
  return sMax > 0 ? { sMax, swr } : null
}

/* The Workers Cache API only honours s-maxage for its own expiry and has no idea what
   stale-while-revalidate means, so an entry stored under its original Cache-Control becomes a
   cache miss after s-maxage seconds regardless of the swr window — "serve stale, refresh in the
   background" is then unreachable. Extends s-maxage to cover the full stale window so the entry
   survives; the caller keeps the original string (e.g. in a response header) to restore before
   replying to an actual client. */
export function extendForStaleWindow(
  cacheControl: string,
  policy: CachePolicy,
): string {
  return cacheControl.replace(
    /s-maxage=\d+/,
    `s-maxage=${policy.sMax + policy.swr}`,
  )
}

/* Whether a cached entry (given its age in seconds) is still fresh, still servable-but-stale, or
   must be treated as a miss. */
export function isrStatus(
  policy: CachePolicy | null,
  ageSeconds: number,
): 'fresh' | 'stale' | 'expired' {
  if (!policy) return 'expired'
  if (ageSeconds <= policy.sMax) return 'fresh'
  if (ageSeconds <= policy.sMax + policy.swr) return 'stale'
  return 'expired'
}
