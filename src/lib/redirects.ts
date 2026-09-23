/* Old URLs of an imported site → their new paths (design/redirects.json, written by
   `pnpm run import`). src/server.ts answers them with a 301 before anything else renders. Only
   same-site paths on either side: a `to` that is not a plain path is dropped, so the file can
   never turn the site into an open redirect. */
export type RedirectTable = ReadonlyMap<string, string>

const path = (p: string) => {
  const clean = p.replace(/\/{2,}/g, '/')
  return clean.length > 1 ? clean.replace(/\/+$/, '') : clean
}
const isPath = (v: unknown): v is string =>
  typeof v === 'string' && /^\/(?![/\\])/.test(v)

export function redirectTable(raw: unknown): RedirectTable {
  const out = new Map<string, string>()
  if (!Array.isArray(raw)) return out
  const rows: Array<unknown> = raw
  for (const r of rows) {
    if (typeof r !== 'object' || r === null) continue
    const from: unknown = 'from' in r ? r.from : undefined
    const to: unknown = 'to' in r ? r.to : undefined
    if (!isPath(from) || !isPath(to)) continue
    const f = path(from)
    if (f !== path(to) && !out.has(f)) out.set(f, to)
  }
  return out
}

/* The new path for a request path, or undefined. Matches with or without a trailing slash, and
   the percent-encoded or decoded spelling. */
export function redirectFor(
  table: RedirectTable,
  pathname: string,
): string | undefined {
  if (!table.size) return undefined
  const p = path(pathname)
  const hit = table.get(p)
  if (hit) return hit
  try {
    const decoded = decodeURIComponent(p)
    return decoded === p ? undefined : table.get(decoded)
  } catch {
    return undefined
  }
}
