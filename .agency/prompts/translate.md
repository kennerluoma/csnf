You are translating a Figma design into this repo. Read AGENTS.md first and follow it exactly.

Inputs

- design/manifest.json — the design: routes → sections (typed, with text, images, layout), plus a palette of every colour/font/radius/spacing seen.
- design/renders/<route>.png — reference render of each route. Look at them.
- design/lint.json — contract violations; mention them in the PR body, don't fix the design.

Do these in order. Commit after each numbered step with a message starting `design:`.

1. Tokens. From manifest.palette, define semantic tokens in src/styles/tokens.css (colours, font families, type scale, radii, section spacing). Map every palette colour to a semantic name; do not leave raw hex anywhere in components.
2. Block plan. List every distinct section type in the manifest. For each: reuse an existing block in src/blocks (if the fields fit) or create a new one. Write the plan as a markdown table to design/pr-body.md before writing any block code.
3. Blocks. For each new block create src/blocks/<Name>/<Name>.schema.ts and <Name>.tsx per AGENTS.md and register it. Fields come from the section's named text/image layers; repeated child instances become an array field. Compose only src/ui primitives; add a primitive if truly needed.
4. Pages. Ensure a `page` document exists for every route (slug from the route path; `/` → `home`). Write them to the Sanity development dataset using @sanity/client with SANITY_WRITE_TOKEN, including block content from manifest text, and upload images from design/assets as image assets. Use deterministic _id values (`page.<slug>`) so re-runs update rather than duplicate.
5. Verify. Run `pnpm typecheck && pnpm lint && pnpm build`. Start the dev server, screenshot each route at 1440 wide with Playwright, and compare against design/renders. Fix obvious differences (spacing, order, alignment, sizes). Stop after 3 passes per route.
6. Report. Finish design/pr-body.md: the plan table, per-route notes on what differs from the render and why, lint warnings, and anything you could not map.

Rules

- Never modify main. Work on the current branch only.
- Never delete existing blocks or documents.
- Prefer fewer, more general blocks over one block per section instance.
- If a section is a near-duplicate of an existing block, reuse it and add an optional field rather than forking.
