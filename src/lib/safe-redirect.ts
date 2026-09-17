/* Only an internal path may be redirected to. `startsWith('/')` alone still lets `//evil.example/x`
   or `/\evil.example` through (both work as an off-site bounce off this origin: a browser treats
   a location starting with // as protocol-relative, and some treat a leading \ like /), so also
   reject a second leading `/` or `\`, then require the parsed URL to still be this made-up origin. */
export function safePath(raw: string): string {
  if (!raw.startsWith('/') || /^[/\\]/.test(raw.slice(1))) return '/'
  try {
    const url = new URL(raw, 'http://local')
    return url.origin === 'http://local' ? url.pathname + url.search : '/'
  } catch {
    return '/'
  }
}

/* `page` here is always already `safePath`-checked. Rebuilt from `pathname` + `search` only, so
   an original hash can't collide with the query we set, and the key/value always land as a real
   query param rather than string-concatenated after a `?` that may already be there. */
export function redirectTo(
  page: string,
  key: string,
  value: string,
  hash: string,
): Response {
  const url = new URL(page, 'http://local')
  url.searchParams.set(key, value)
  return new Response(null, {
    status: 303,
    headers: { location: `${url.pathname}${url.search}${hash}` },
  })
}
