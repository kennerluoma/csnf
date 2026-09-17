You are planning (not implementing) the translation of a Figma design into this repo. Read AGENTS.md, especially the block inventory at the bottom, .agency/lessons.md (rules learned from previous sites), and design/manifest.json. Look at design/renders/*.png.

Write ONE file, design/plan.md, and nothing else. Do not edit code. Do not run the build.

design/plan.md contains:

1. A table with one row per distinct section type in the manifest (chrome sections Header/Footer/Nav included, marked as chrome):
   `| Section type | Routes it appears on | Block | Reuse or new | Fields / options | Notes |`
   - Reuse an inventory block whenever its fields fit, adding an optional field or a variant option if that is all that's missing. Say which field/option.
   - Sections that list works, artists, exhibitions, events or news map to the index blocks (`artworkGrid`, `artistList`, `exhibitionList`, `eventCalendar`, `postList`) with options (`mode`, `limit`, `featuredOnly`, `view`), never to `cardGrid` copies of the sample items.
   - Sections with inputs map to `contactForm` or `newsletterSignup`.
   - Only propose a new block when no inventory block fits structurally (different children or layout direction). Name it, list its fields (from the section's named text/image layers; repeated child instances become an array), and which primitives it composes.
   - In normalised fidelity (agency.json), two sections that differ only in snapped values, text or child count are the same block.
   - Routes with `kind: screen` are app-like layouts, not stacked pages: plan them as one route component each (which primitives, which content types feed it, which `regions` map to which part), and list what each `state` changes (hover, selection, open menu). Never plan a block per screen state.
2. A "Tokens" list: semantic names for every palette colour, the font families, the type scale (max 6 styles), radii and section spacing, each with the manifest value it comes from.
3. A "Pages" list: every route → page slug → ordered block keys; plus any nav targets that need an empty page document.
4. "Rebuild" (only when design/manifest.prev.json exists): the sections whose content, layout or tree changed, were added, or were removed, from diffing the two manifests. Sections not listed will not be touched.
5. "Open questions": anything ambiguous in the design (placeholder copy, unnamed layers, lint warnings) the implementer should flag in the PR.

Keep it under 200 lines. Be concrete: field names, option values, file paths.
