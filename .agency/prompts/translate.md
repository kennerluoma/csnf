You are translating a Figma design into this repo. Read AGENTS.md first (including the block inventory at the bottom) and follow it exactly.

Inputs

- design/manifest.json — the design: routes → sections (typed, with text, images, layout, a compact `tree` of child layers), plus a palette of every colour/font/radius/spacing seen. Sections named Header/Footer/Nav are site chrome, not page blocks: implement them as layout components in src/lib driven by the `siteSettings` document, rendered in `__root.tsx` around the page.
- design/renders/<route>.png — reference render of each route. Look at them.
- design/plan.md — if present, the block plan from the planning pass (a table: section → block, reuse/new, fields, notes). Follow it; correct it only where it is plainly wrong and say so in the PR body.
- manifest.lint — contract violations; mention them in the PR body, don't fix the design.

Do these in order. Commit after each numbered step with a message starting `design:`.

1. Tokens. From manifest.palette, define semantic tokens in src/styles/tokens.css (colours, font families, type scale, radii, section spacing). Map every palette colour to a semantic name; do not leave raw hex anywhere in components.
2. Block plan. If design/plan.md exists, copy its table into design/pr-body.md and continue. Otherwise list every distinct section type in the manifest and, for each, reuse an existing block from the inventory in AGENTS.md (if the fields fit) or create a new one; write the plan as a markdown table to design/pr-body.md before writing any block code. Sections that list works, artists, exhibitions, events or news map to the index blocks (`artworkGrid`, `artistList`, `exhibitionList`, `eventCalendar`, `postList`) with options, never to `cardGrid` copies of the design's sample items. Sections with inputs map to `contactForm` or `newsletterSignup`.
3. Blocks. For each new block create src/blocks/<Name>/<Name>.schema.ts (with a `description` saying when to use it) and <Name>.tsx per AGENTS.md and register it in schemas.ts and registry.ts. Fields come from the section's named text/image layers; repeated child instances become an array field. Compose only src/ui primitives; add a primitive if truly needed. Run `pnpm inventory` afterwards.
4. Pages. Ensure a `page` document exists for every route (slug from the route path; `/` → `home`). Write them to the Sanity dataset named in agency.json (`sanityDataset`) using @sanity/client with SANITY_WRITE_TOKEN, including block content from manifest text, and upload images from design/assets as image assets. Use deterministic _id values (`page-<slug>`; never dots, the public read role hides dotted ids) so re-runs update rather than duplicate. Do not create documents of the content types (artwork, exhibition, event, post…) from design sample items: index blocks read whatever the client enters; leave the seed content in place.
5. Verify. Run `pnpm typecheck && pnpm lint && pnpm build`. A dev server is already running at http://localhost:3000 (if not, start one with `pnpm dev` in the background). Run `pnpm shot` to screenshot every route into design/shots/, then Read each design/shots/<route>.png next to its design/renders/<route>.png and compare. Fix obvious differences (spacing, order, alignment, sizes, colours). Stop after 3 passes per route. The site reads Sanity through its CDN, so after writing documents wait ~20s (or set useCdn: false locally) before screenshotting.
6. Report. Finish design/pr-body.md: the plan table, per-route notes on what differs from the render and why, lint warnings, and anything you could not map.

Fidelity (agency.json → `fidelity`, default "normalised")

- normalised: the manifest's `normalisation` block says which spacing base and anchors were learned from the design and lists every value the extractor snapped (`snapped`). Treat two sections as the same block when they differ only in snapped values, in text, or in how many repeated children they have; add a variant prop only for structural differences (different children, different layout direction). A screenshot difference inside the normaliser's tolerance is not a defect: do not add overrides to chase it. Keep to at most 6 type styles and one spacing scale.
- exact: nothing was snapped. Match values as given; per-block token overrides are allowed. Expect more blocks.

Mode

- First run: no design/mapping.json exists. Do all six steps. Finish by writing design/mapping.json: `{ "manifest": { "fileKey", "version" }, "sections": { "<figma section id>": { "type": "<section type>", "block": "<block schema name>" (omit for chrome), "files": ["src/blocks/<Name>/<Name>.schema.ts", …], "documents": [{ "_id": "page-<slug>", "blockKey": "<block _key>" } | { "_id": "siteSettings", "fields": ["siteName", …] }] } } }`.
- Rebuild: design/mapping.json and design/manifest.prev.json exist. Diff design/manifest.json against manifest.prev.json first. Only touch sections whose content, layout or tree changed, sections that are new, and sections that were removed (unmap them; never delete their block files or documents). Existing blocks, tokens and hand edits on main stay as they are unless the design changed them. Client edits made in the studio win over re-seeded content: patch only the fields whose design text changed. Update mapping.json and list the diff in the PR body.

Rules

- Never modify main. Work on the current branch only.
- Never delete existing blocks or documents.
- Prefer fewer, more general blocks over one block per section instance.
- If a section is a near-duplicate of an existing block, reuse it and add an optional field rather than forking.
- Placeholder copy in the design (e.g. a wordmark literally reading "Name", "Page Title") is still the content: write it as-is and flag it in the PR body under "Things to check".
- If the header links to routes the manifest doesn't contain, create empty page documents for them so nothing 404s, and flag it. Links to /work, /artists, /exhibitions, /events, /news need no page document (default index pages exist).
