You are planning (not implementing) the translation of a Figma design into this repo. Read AGENTS.md, especially the block inventory at the bottom, .agency/lessons.md (rules learned from previous sites), and design/manifest.json. Look at design/renders/*.png.

Write ONE file, design/plan.md, and nothing else. Do not edit code. Do not run the build.

design/plan.md contains:

1. A table with one row per distinct section type in the manifest (chrome sections Header/Footer/Nav included, marked as chrome):
   `| Section type | Routes it appears on | Block | Reuse or new | Fields / options | Notes |`
   - Reuse an inventory block whenever its fields fit, adding an optional field or a variant option if that is all that's missing. Say which field/option.
   - Sections that list works, artists, exhibitions, events or news map to the index blocks (`artworkGrid`, `artistList`, `exhibitionList`, `eventCalendar`, `postList`) with options (`mode`, `limit`, `featuredOnly`, `view`), never to `cardGrid` copies of the sample items.
   - Sections with inputs map to `contactForm` or `newsletterSignup`.
   - A website import (`manifest.source.kind == "website"`) also has `collections`: plan each as a content type (existing one where it fits: `work` → `artwork`, `news` → `post`) with its list route block and a detail route styled from its `sample`; its instances are real content, not routes.
   - Only propose a new block when no inventory block fits structurally (different children or layout direction). Name it, list its fields (from the section's named text/image layers; repeated child instances become an array), and which primitives it composes.
   - In normalised fidelity (agency.json), two sections that differ only in snapped values, text or child count are the same block.
   - Routes with `kind: screen` are app-like layouts, not stacked pages: plan them as one route component each (which primitives, which content types feed it, which `regions` map to which part), and list what each `state` changes (hover, selection, open menu). Never plan a block per screen state.
2. A "Tokens" list: semantic names for every palette colour, the font families, the type scale (max 6 styles), radii and section spacing, each with the manifest value it comes from.
3. A "Pages" list: every route → page slug → ordered block keys; plus any nav targets that need an empty page document.
4. "Rebuild" (only when design/manifest.prev.json exists): the sections whose content, layout or tree changed, were added, or were removed, from diffing the two manifests. Sections not listed will not be touched.
5. "Content model": every content type this kind of site runs on gets a working, styled index and detail route and a admin entry, drawn or not: artworks, artists, exhibitions, events, news/articles, and the categories/tags/series that group them. The template ships them; say which the design styles directly and which inherit that styling. Never plan to leave a default route with starter styling.
6. "Decisions" (not questions): the operator does not want to be asked before the site is complete. For each ambiguity (placeholder copy, unnamed layers, a nav item with no screen, the mobile nav form, uncaptioned images, an icon with no drawn behaviour) write the decision you are taking, the one-line reason, and where to change it later. Choose what a finished site of this kind would do. The only things that stay questions are ones code cannot settle: a font or asset without a web licence, a missing legal/contact fact.

No length limit: the plan is the build's specification, so be thorough. Every route, every section on it, every block with its options and the fields it reads, every content type with its fields, every decision. Be concrete: field names, option values, file paths, image assets by name. Cut only repetition, never detail; a section the implementing agent has to guess at is a section that comes out wrong.
