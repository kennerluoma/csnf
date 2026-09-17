# Alex Olson (alex-olson)

Repo: https://github.com/kennerluoma/alex-olson

## Fix sessions

### PR #15 fix: lint error in scripts/fig.ts (merged)

Ports the template's `scripts/fig.ts` (`guids.at(-1)`), which clears the `no-unnecessary-condition` error that failed CI on #14.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

### PR #14 fix: #13 #10 (fix/20260917-0255) (merged)

Resolves two overlapping issues: #13 gives the type sizes for both sides of 1024px, and #10 is the layout below 1024px. They share one breakpoint: the split screen now stacks below **1024px** (it was 768px), because that is where #13 switches from the mobile values (`max(floor, vw)`) to the desktop values (`vw` only). Leaving the split at 768px would have put mobile-sized type (up to 43px nav) in half-width panes between 768 and 1023px. If the split should stay at 768px, it is a one-word change in `Screen`/`Pane`.

### #13 Scale type and spacing with the viewport above 1024px

All in tokens; no component sets a size.

- `src/styles/tokens.css`: the four existing type tokens take the values from the issue. The site has `display/h2/body/h3/small` rather than the previous site's `xs/sm/md/lg`, so I mapped them like this:
  - `display` (wordmark, nav, list titles, arrows) = **lg**: `max(22px, 4.2328vw)` → `2vw` from 1024px
  - `h2`, `body` (screen titles, statements) = **md**: `max(18px, 3.1746vw)` → `1.5vw`
  - `h3`, `small` (captions, years) = **xs/sm**: `max(12px, 2.1164vw)` → `1.0582vw`

  **Decision needed:** captions were 18px in the design and are now 16px at 1512 (xs/sm) because the issue gives only four sizes. If captions should stay a step larger, `--text-h3` needs its own value.

- Spacing from 1024px uses the issue's px ÷ 1512 × 100 rule: `--spacing` base (6 → 0.3968vw), gutter (24 → 1.5873vw), section (66), bar (18), screen-top (102), thumb (96) and measure (620). Below 1024px they stay in px.
- New token `--spacing-header`: `max(66px, calc(4.2328vw * 1.1875 + 40px))`, and `calc(2.1164vw * 1.1875 + 40px)` from 1024px. It's used as the header's `min-h-header` in `src/lib/SiteHeader.tsx`. It's a new token because the issue defines the header height as its own value.
- New token `--tracking-base: 0.03em`, applied to every element in `src/styles/app.css` (`@layer base`). It's set per element rather than on `body` because an inherited `em` letter-spacing gets fixed at the body's 16px (it measured 0.48px at every size).

How to check: open /paintings and /exhibitions at 1024, 1512 and 1920 wide. At 1512 the nav is 30.24px and the header 78px. At 1920 they are 38.4px and 95.6px. The layout grows with the window, and letter-spacing is 3% of each size (0.91px on the nav at 1512).

### #10 Mobile

- `src/ui/index.tsx`: `Screen`, `Pane`, `EntryList` and `NavLink` switch at `lg:` (1024px) instead of `md:`. Below it, panes stack at their content height. Padded panes start at the gutter instead of the 102px screen-top, since nothing overlays them.
- `src/lib/SiteHeader.tsx`: below 1024px the header sits in the page flow above the panes instead of fixed over them. It keeps the difference blend, so it is black on the white page. The wordmark and nav use the `h2` size (18px at 390px) and the nav wraps. From 1024px it is fixed and overlaid as before.
- `src/routes/__root.tsx`: stacked pages only need the screen-top padding from 1024px.
- `src/lib/ArtworkScreen.tsx`, `ListScreen.tsx`, `AboutScreen.tsx`: the image min-height and the empty right pane on About follow the same breakpoint.

How to check: at 390px wide, open /paintings (thumbnails, then the selected work with caption and pager), /exhibitions (list, then the exhibition), / (the two featured works stacked) and /about. The nav wraps onto two lines at 18px and there is no horizontal scroll.

**Interpretation:** the design names `Menu-Mobile` / `Mobile=Default` / `Mobile=Mobile3` components, but the manifest has no geometry for them and no mobile route. `.agency/lessons.md` says mobile nav usually becomes an "Index / Close" overlay. I followed the issue text instead ("nav shrinks to 18px and wraps"). If the overlay from those components is wanted, see Follow-ups.

### Not resolved

- `pnpm typecheck` fails in `scripts/extract.ts(628)`: `figToRest(..., { pages })` doesn't match its `{ page?: string }` type. This comes from the runner's uncommitted change to `scripts/extract.ts` that was already in the working tree. It isn't part of this branch's commits and I didn't touch it. `pnpm lint` and `pnpm build` pass.

### Follow-ups

- Mobile menu: the Figma components `Menu-Mobile` (515:1431) and `Mobile=Default` / `Mobile=Mobile3` (306:137, 515:1295) aren't extracted: no frames, sizes or states in `design/manifest.json`. Decide whether mobile gets an "Index / Close" overlay or keeps the wrapping nav. If the overlay is wanted, re-extract with the mobile page (the pending `--from-fig` mobile-pages change in `scripts/extract.ts`).
- At 1024px the gap between the wordmark and the right-aligned nav is about 225px with the current five nav items. A longer nav would collide there, so re-check if items are added.
- `Eyebrow` still uses `tracking-widest`, which overrides the 0.03em rule. No screen uses it today, but blocks such as `hero` and `artworkGrid` do if they're ever added to a page.
- `--container-content` is still a fixed 94.5rem (1512px). The split screens don't use `Container`, but stacked block pages (e.g. a `contactForm` page) cap at 1512px while their type keeps growing past it.
- Mobile captions are 12px (the issue's `max(12px, …)` floor), which is small for the long artwork captions on /paintings. Worth confirming with the client.

Closes #13
Closes #10

## Issues

### #13 Scale type and spacing with the viewport above 1024px [closed] design-gap, in-session

On desktop the whole layout should scale with the viewport instead of using fixed pixel sizes, which the design cannot express.

What the previous site did (Next.js version), and what we want here:

- Type: `--text-xs/sm: max(12px, 2.1164vw)`, `--text-md: max(18px, 3.1746vw)`, `--text-lg: max(22px, 4.2328vw)` below 1024px; above 1024px `--text-xs/sm: 1.0582vw`, `--text-md: 1.5vw`, `--text-lg: 2vw`. Letter-spacing 0.03em everywhere.
- Header height: `max(66px, calc(4.2328vw * 1.1875 + 40px))`, above 1024px `calc(2.1164vw * 1.1875 + 40px)`.
- The vw values are px ÷ 1512 (the design frame width) × 100. The design's 24px is 1.5873vw, 32px is 2.1164vw, etc.

Apply this through tokens (clamp/max), not per component. Check /paintings and /exhibitions at 1024, 1512 and 1920 wide.

### #12 Uncommitted formatting [closed] design-gap, from-agent

`design/manifest.json` and `design/plan.md` have prettier-only changes in the working tree that are not committed; discard them.

_From the build agent's checklist on https://github.com/kennerluoma/alex-olson/pull/1._

> **kennerluoma**: Resolved: the runner now formats the clone before the final commit, and PR #1 was fixed up before merge.

### #10 Mobile [closed] design-gap, from-agent, in-session

the design has mobile nav components but no mobile frames. Panes stack, and the nav shrinks to 18px and wraps.

_From the build agent's checklist on https://github.com/kennerluoma/alex-olson/pull/1._

### #11 Default index routes [open] design-gap, from-agent

`/work` (artwork grid), `/artists`, `/events` and `/news` still use the starter layouts. They are restyled only through tokens and are not linked from the nav.

_From the build agent's checklist on https://github.com/kennerluoma/alex-olson/pull/1._

### #9 Home selection [open] design-gap, from-agent

the home screen shows the first two featured artworks (featured, then newest). The client picks them by ticking "featured".

_From the build agent's checklist on https://github.com/kennerluoma/alex-olson/pull/1._

### #8 /intro [open] design-gap, from-agent

(a black half-panel with a scribble image in one state) looks like a splash or loading screen, and **`/exhibitionsings`** duplicates `/exhibitions`. Neither is built; confirm.

_From the build agent's checklist on https://github.com/kennerluoma/alex-olson/pull/1._

### #7 Works on Paper [open] design-gap, needs-info, from-agent

in the nav, but not designed and has no artworks. Tag works `works-on-paper` in the studio to fill it.

_From the build agent's checklist on https://github.com/kennerluoma/alex-olson/pull/1._

> **kennerluoma**: Triage: Which artwork documents (by title or slug) should be tagged works-on-paper in the studio? The /works-on-paper viewer already works (same code path as /paintings), it just has nothing tagged.

### #6 Font [open] design-gap, needs-info, from-agent

Lars Trial is a trial licence. Buy Lars and self-host it (add an `@font-face`; `--font-sans` already lists `Lars` first), or keep Hanken Grotesk.

_From the build agent's checklist on https://github.com/kennerluoma/alex-olson/pull/1._

> **kennerluoma**: Triage: Buy a Lars licence and self-host it via @font-face, or ship Hanken Grotesk as the permanent body font? --font-sans already lists Lars first, but it's still the trial version.

### #5 Exhibition image captions [open] design-gap, needs-info, from-agent

only the first image of the Platypus show has a caption (Film's, from state `501:2617`). The venue for the show is unknown.

_From the build agent's checklist on https://github.com/kennerluoma/alex-olson/pull/1._

> **kennerluoma**: Triage: What are the captions and venue for the Platypus exhibition's remaining images? Only the first image has a caption (Film's, reused from a Figma state), and the venue is unset.

### #4 About links [open] design-gap, needs-info, from-agent

"Contact" and "CV" point to `#contact` and `#cv`, because the design gives no targets.

_From the build agent's checklist on https://github.com/kennerluoma/alex-olson/pull/1._

> **kennerluoma**: Triage: What should About's Contact and CV links point to — a contactForm block anchor on the same page, a dedicated route, or an uploaded CV/resume file? The design gives no real targets.

### #3 Untitled artworks [open] design-gap, needs-info, from-agent

15 paintings appear only as untitled thumbnails ("Rectangle NN"), so they are seeded as "Untitled 01–15" with no year, medium or dimensions. Only Film has a full caption. "Sea Script" and "Other Logics" are titled from layer names.

_From the build agent's checklist on https://github.com/kennerluoma/alex-olson/pull/1._

> **kennerluoma**: Triage: What are the real titles, year, medium and dimensions for the 15 paintings currently seeded as Untitled 01–15? Also confirm 'Sea Script' and 'Other Logics' (titled from Figma layer names) are correct.

### #2 Placeholder copy in the design [open] design-gap, needs-info, from-agent

**Placeholder copy in the design**:

- Other Projects rows read "Project title / 2022" ×9, and exhibition rows read "Diary, Altman Siegel, Sans / 2022" ×9. I did not seed these, because they are repeats of one placeholder row.
- I briefly seeded an `exhibition-diary` document with a made-up start date (2022-01-01). It became the default exhibition, so I deleted it in the same run and removed it from the seed script. It was never client content.
- If "Diary, Altman Siegel, Sans" is a real show, add it in the studio with its real dates.

_From the build agent's checklist on https://github.com/kennerluoma/alex-olson/pull/1._

> **kennerluoma**: Triage: What are the real Other Projects entries (9 rows currently read placeholder 'Project title / 2022')? Also confirm whether 'Diary, Altman Siegel, Sans' is a real exhibition and, if so, its real dates and venue.
