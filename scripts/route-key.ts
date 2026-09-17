/* Pure route-naming logic pulled out of extract.ts for testing. */

// A trailing number used to be stripped unconditionally ("Frame 1".."Frame 40" all folding into
// one "frame" route, "Exhibition 2024"/"Exhibition 2025" too). Explicit variant markers (alt,
// v2, copy, a trailing parenthetical) are still stripped; a bare number is not — it stays in the
// slugged path ("/frame-2") instead of silently losing the frame.
export const routeKey = (name: string) =>
  name
    .replace(/\s*@.*$/, '')
    .replace(/\s*[–-]\s*(alt|v\d+|copy|final|new|old|option|variant).*$/i, '')
    .replace(/\s*\(.*\)\s*$/, '')
    .trim()
    .toLowerCase()

// Applied to a mobile frame's name before routeKey, so "Home – Mobile" / "Mobile / Home" /
// "iPhone 14 – Home" pair with the desktop "Home" route (same routeKey) instead of becoming
// their own route ("/home-mobile") with their own Sanity page document.
const MOBILE_TOKEN_RE =
  /\biphone(?:\s*\d+(?:\s*(?:pro|plus|max|mini|se))?)?\b|\b(mobile|phone|android|sm|375|390|393)\b/gi
export const stripMobileTokens = (name: string) =>
  name
    .replace(MOBILE_TOKEN_RE, ' ')
    .replace(/[\s/–-]+/g, ' ')
    .trim()

export type RouteForDedupe = {
  path: string
  viewport: 'desktop' | 'mobile'
  id: string
}

/* After routes are built: find any remaining duplicate `path` and suffix all but the first with
   `-2`, `-3`, … . A single desktop route paired with one or more mobile routes sharing its path
   is expected (pages.ts skips the mobile ones) and left alone; anything else sharing a path
   ("About Us" vs "About-Us", "Home"/"Index"/"Landing", a name that slugs to "") used to silently
   overwrite the earlier route's Sanity page document and design/renders file. Returns the new
   path for each route index that changed, plus a warning per rename. Does not mutate `routes`. */
export function dedupeRoutePaths<T extends RouteForDedupe>(
  routes: Array<T>,
): {
  renamed: Map<number, string>
  warnings: Array<{ index: number; message: string }>
} {
  const byPath = new Map<string, Array<number>>()
  routes.forEach((r, i) => {
    const arr = byPath.get(r.path) ?? []
    arr.push(i)
    byPath.set(r.path, arr)
  })
  const renamed = new Map<number, string>()
  const warnings: Array<{ index: number; message: string }> = []
  for (const [path, indices] of byPath) {
    if (indices.length < 2) continue
    // viewport is only ever 'desktop' or 'mobile', so "exactly one desktop" already implies
    // the rest are mobile.
    const isDesktopMobilePair =
      indices.filter((i) => routes[i]!.viewport === 'desktop').length === 1
    if (isDesktopMobilePair) continue
    let n = 2
    for (const i of indices.slice(1)) {
      const newPath = `${path}-${n}`
      renamed.set(i, newPath)
      warnings.push({
        index: i,
        message: `route path "${path}" collided with another route; moved to "${newPath}"`,
      })
      n++
    }
  }
  return { renamed, warnings }
}

export type RouteForRenderDedupe = { render: string; id: string }

/* Render filenames only need to be unique, not pretty: append the node id on a collision (the
   desktop/mobile pair above is the common case — two names that both slug to the same string).
   Returns the new render path for each route index that changed. Does not mutate `routes`. */
export function dedupeRenders<T extends RouteForRenderDedupe>(
  routes: Array<T>,
): Map<number, string> {
  const used = new Set<string>()
  const renamed = new Map<number, string>()
  routes.forEach((r, i) => {
    let render = r.render
    if (used.has(render))
      render = render.replace(
        /\.png$/,
        `-${r.id.replace(/[^a-zA-Z0-9]/g, '')}.png`,
      )
    used.add(render)
    if (render !== r.render) renamed.set(i, render)
  })
  return renamed
}
