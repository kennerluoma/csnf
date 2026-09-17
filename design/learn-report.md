# learn report — 2026-09-17

Sources: `.agency/history/alex-olson.md` (fix PR #14/#15, issues #2–#13), `.agency/history/performa-2025.md` (fix PR #11, issues #2–#10). `agency-test-1` and `agency-test-2` have no issues or PRs, so they contributed nothing.

Several Performa follow-ups were already fixed in the template before this pass, so they needed no change here:

- the prerender filter skips `?` links (3f16bc8)
- `/_serverFn` requests pass through ISR (3f16bc8)
- the sitemap has guards and a `works-on-paper` default (2001bf5, `src/lib/defaults.ts`)
- live-state helpers exist (4740bdb)
- prerender reads the dataset at build (0ab1afb)

## Changes

### Template: `A` primitive (`src/ui/index.tsx`)

**Drove it:** performa-2025 PR #11 step 6. Performa had to rewrite the template's `A` by hand in three ways:

- internal links with a query string (`?event=…`) are routed via the parsed href
- `activeOptions: { exact: true, includeSearch: true }`, because otherwise every link to `/` counts as active
- `resetScroll={false}` for in-place selection links (`SoftLink`)

**The bug, verified here:** the template passed `to={href}`. `router.buildLocation({ to: '/news?tag=a%20b' })` gives pathname `/news?tag=a b` and `search: {}`. On client-side navigation, the template's own `?tag=` links on `/news/$slug` and the `?month=` links in `EventCalendar` therefore reach the route with no search params.

**Change:** `A` now splits the href:

- `to` = pathname
- `search` = `defaultParseSearch(query)`, the router's own parser, so it round-trips (`buildLocation` → `/news?tag=a+b&year=2024&month=2026-09`)
- `hash` from the fragment

It also sets exact active matching and accepts `resetScroll`.

**Exception to the 2+ projects rule:** this was written by hand in only one project. I made the change anyway because the bug breaks blocks every site ships (`EventCalendar`, the news tag links), not just Performa's screens.

### Lessons (`.agency/lessons.md`)

| Lesson                                                                                    | Change                                                                                                                                                                                                                      | Driven by                                                                                                                                                                   |
| ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Layout: variant-named frames are states or viewports                                      | Rewritten (was "same name only"); now cites both projects                                                                                                                                                                   | alex-olson #8 (`/exhibitionsings` duplicates `/exhibitions`); performa follow-up (`/mobile-cal`, `/red-alt` extracted as routes)                                            |
| Layout: default indexes and detail routes stay live                                       | New                                                                                                                                                                                                                         | alex-olson #11 (`/work`, `/artists`, `/events`, `/news` left with starter layouts); performa #7 (`/events` default next to `/calendar`, detail pages with template styling) |
| Mobile: stack below `lg`; mobile nav form is the client's call                            | Rewritten. **Contradiction removed:** the old lesson said the nav becomes an "Index / Close" overlay, but alex-olson's issue #10 chose a wrapping nav, while performa built the overlay and asked about it (#6, still open) | alex-olson #10 and PR #14 (768 → 1024 and why); performa #6                                                                                                                 |
| Type: `max(floor, vw)` below 1024, plain `vw` above, no cap                               | Rewritten. **Contradiction removed:** the old lesson said `clamp(min, vw, max)`, but the client asked for no upper cap and checked the result at 1920                                                                       | alex-olson #13 and PR #14                                                                                                                                                   |
| Type: `em` letter-spacing per element, not on `body`                                      | New. Seen once, but the cause is general: CSS inherits the computed value                                                                                                                                                   | alex-olson PR #14 (`--tracking-base` measured 0.48px at every size)                                                                                                         |
| Type: Trial or commercial fonts                                                           | Rewritten to cover commercial fonts, not just "Trial"; now cites both projects                                                                                                                                              | alex-olson #6 (Lars Trial); performa #2 (Theinhardt, Fugue)                                                                                                                 |
| Images: design images have no metadata, so seed "Untitled NN" and list guesses in a table | New                                                                                                                                                                                                                         | alex-olson #3 (15 "Rectangle NN" works, titles from layer names), #5 (captions); performa #4 (guessed image pairings, missing asset)                                        |
| Interaction: dismissal lasts the session and has a `siteSettings` switch                  | Merged into the Intro/Splash lesson                                                                                                                                                                                         | alex-olson #8 (intro); performa #8 (live-bar dismissal)                                                                                                                     |
| Interaction: selection is a `?type=slug` link through `A` with `resetScroll={false}`      | New. Seen once; the cause is general (ISR, shareable URLs, full page reloads)                                                                                                                                               | performa PR #11 (`SoftLink`, `Row`, 403s through `_serverFn`)                                                                                                               |
| Interaction: live and "today" state computed on the client with `useNow()`                | New. Seen once; the cause is general (every route is prerendered)                                                                                                                                                           | performa PR #11 follow-up (`/broadcast` and "Happening today" frozen at build)                                                                                              |
| Process: repeated placeholder rows and borrowed copy are not content                      | Rewritten with performa's examples and "never invent a field"                                                                                                                                                               | alex-olson #2 (made-up exhibition date became the default show); performa #3 (repeated "2 pm / 351 Canal St" rows, body copy from another commission)                       |
| Process: design older than expectations                                                   | Now cites both projects                                                                                                                                                                                                     | performa #6 ("Interaction and mobile were not in the design")                                                                                                               |

### Prompt rules

- **`translate.md`**
  - Placeholder rule: one-off placeholders are still written as-is. Repeated rows and copy about a different item are not seeded. Before, the prompt said "placeholder copy is still the content", which is why Performa seeded "2 pm (60 min.) / 351 Canal St" on every row (performa #3). The old lesson said the opposite (alex-olson #2).
  - Screen rule (a): mobile starts below `lg`, and the agent picks a nav form and asks about it (alex-olson #10, performa #6).
  - Screen rule (b): selection is an `A` search-param link with `resetScroll={false}` (performa PR #11).
  - Screen rule (d): `max(floor, vw)` / `vw` with no cap, header height included (alex-olson #13).
  - Screen rule (f), new: live and "today" state on the client (performa follow-up).
  - New rule: style the detail routes of listed content types and report unlinked default indexes (alex-olson #11, performa #7).
  - New rule: "Guessed pairings" table in the PR body (alex-olson #3/#5, performa #4).
- **`plan.md`**: "Open questions" must always cover font licences, the mobile nav form and uncaptioned images. These came up as needs-info issues on both projects (alex-olson #3/#5/#6/#10, performa #2/#4/#6).
- **`fix.md`**: when an issue and `lessons.md` disagree, the issue wins and the PR says so. alex-olson PR #14 had to reason this out (the issue said "wrap", the lesson said "overlay"). AGENTS.md says lessons override defaults, which could be read as overriding issues.

### Checks

- `pnpm typecheck`: pass.
- `pnpm lint`: pass.
- `pnpm inventory`: pass (no change, 10 blocks and 21 primitives).
- `pnpm build`: the client and server bundles build, but prerender fails with `VITE_SANITY_PROJECT_ID is not set`. This checkout has no `.env`, and since 0ab1afb prerender reads the dataset (CI provides the id).
- Not checked in a browser: that client-side navigation now keeps search params. The router-level behaviour was tested with `buildLocation` in Node.

## Recurring issues not encoded

- **Uncommitted prettier-only changes** (alex-olson #12, performa #9): a runner problem, not the agent's. The runner already formats before the final commit (kennerluoma on alex-olson #12). The Performa file was the runner's own `scripts/extract.ts` drift.
- **Links with no target** (alex-olson #4 `#contact` / `#cv`; performa #5 empty pages, the Lithuania Pavilion tile): `translate.md` already says to create empty pages and flag them, and both agents did. What's missing is the client's answer, which no rule can supply.
- **Home "featured" selection** (alex-olson #9): one project, and a content decision, not a build rule.
- **Search icon with no behaviour** (performa #6): one project; there's no general rule beyond "ask", which the Process lesson already covers.
- **Contact / CV file target**: a CV upload field on `siteSettings` or `artist` could help, but only alex-olson raised it and it's still open (#4). Wait for the answer before adding schema.
- **Scaled `--container-content`** (alex-olson PR #14 follow-up: stacked pages cap at 1512px while type keeps growing): a follow-up nobody has confirmed.
- **Eyebrow `tracking-widest` overriding site tracking** (alex-olson follow-up): specific to that site's tokens; the new `em` tracking lesson covers the general case.
- **Shared screen primitives** (`Screen` / `Pane` / `EntryList` in alex-olson; `Row` / `Tile` / `SoftLink` / `Chip` and the "Index / Close" overlay in performa): both projects wrote split-screen layouts by hand. The history only has PR prose, not the code, and the two sets don't clearly match, so a template primitive would be guesswork. Worth a follow-up that diffs the two repos' `src/ui` directly.
- **Porting template code the fix session couldn't read** (performa PR #11: kennerluoma/csnf wasn't accessible, so `src/server.ts` was rewritten from a description): this is about runner permissions or the brief, not a lesson. The brief should inline the template files it asks to port.
- **Extractor treating mobile/alt frames as routes** (performa follow-up, `pnpm shot` 404s): the real fix belongs in `scripts/extract.ts` / `shot.ts`. That's larger than this pass, so for now the Layout lesson tells the agent how to read such routes.
- **Detail pages not prerendered when only reachable via `?` links** (performa follow-up): the template still crawls only (no `prerender.pages` from a Sanity query in `vite.config.ts`), so these pages render once through ISR. That is the documented fallback (AGENTS.md → Rendering), and only one project raised it, so I left it. If it's wanted, it's a template change: list the detail slugs in `prerender.pages` at build.
