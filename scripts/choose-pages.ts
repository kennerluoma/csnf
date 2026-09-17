/* Which Figma pages become the site, shared between the --from-fig and --from-bundle extraction
   paths so the same file produces the same route set regardless of source (the point of
   comparing a plugin export against a .fig export). Pulled out for testing. */

const AUTO_MAIN_RE = /^(finals?|site|website|web|pages|desktop|designs?)$/i
const JUNK_PAGE_RE =
  /^(cover|thumbnail|components?|symbols?|styles?|sketch(es)?|archive|old|wip|playground|moodboard|inspiration|internal only canvas|[-–—_\s]+)$/i

/* `undefined` means "use every page" (nothing to narrow down to). Throws when an explicit
   --page doesn't match any page in the file — it used to just fall through, and for
   --from-bundle silently extracted 0 routes (or only the mobile ones) from a still-valid-looking
   manifest. */
export function choosePages(names: Array<string>, pageArg: string | undefined) {
  if (pageArg && !names.includes(pageArg))
    throw new Error(`page "${pageArg}" not found; pages: ${names.join(', ')}`)
  const main = pageArg ?? names.find((p) => AUTO_MAIN_RE.test(p.trim()))
  // mobile pages ride along: their frames become the mobile viewport of the same routes
  const mobile = names.filter((p) => /mobile/i.test(p) && p !== main)
  if (main) return [main, ...mobile]
  // No obvious main page: drop the ones that are never the site (covers, component sheets,
  // sketches, separators, Figma's internal canvas) rather than turning them into routes.
  const kept = names.filter((p) => !JUNK_PAGE_RE.test(p.trim()))
  return kept.length && kept.length < names.length ? kept : undefined
}
