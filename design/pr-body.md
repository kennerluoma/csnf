# Design translation: csnf (Figma `Z6zl7ty638PnjLFGKfOI1M`)

## Block plan

The manifest has 1 route (`/`, frame "Template") with 3 sections, so 3 distinct section types.

| Section type | Instances  | Decision                                                                           | Target                                             | Fields (from named layers)                                                                                                                      | Notes                                                                                                                                              |
| ------------ | ---------- | ---------------------------------------------------------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Header       | 1 (`5:11`) | Site chrome, not a block                                                           | `src/lib/SiteHeader.tsx`, rendered in `__root.tsx` | `siteSettings.siteName` ← `wordmark`; `siteSettings.nav[]` ← `Home`, `About`; `siteSettings.logo` (optional, falls back to the `logomark` ring) | `#f7f7f7` bar, 8/24 padding, logo left, nav right                                                                                                  |
| Hero         | 1 (`5:36`) | **Reuse** `hero` and add an optional `layout` field (`split` default, `panel` new) | `src/blocks/Hero`                                  | `heading` ← `Page Title`; existing `eyebrow`, `body`, `cta`, `image` stay optional                                                              | Near-duplicate of the existing Hero: the new `panel` layout centres the content in a rounded `surface-alt` panel with a 240px min height. No fork. |
| Footer       | 1 (`5:12`) | Site chrome, not a block                                                           | `src/lib/SiteFooter.tsx`, rendered in `__root.tsx` | `siteSettings.siteName` ← `wordmark`; `siteSettings.logo` (optional); `siteSettings.footerText` (optional, not in the design)                   | Ink background, 48/24 padding, logomark and wordmark stacked in the centre                                                                         |

New primitives in `src/ui`: `Panel` (a rounded tinted surface) and `Logomark` (the ring mark from the design, drawn in CSS). No new block types.

## What changed

- **Tokens** (`src/styles/tokens.css`): the three palette colours are raw `--color-palette-*` values, mapped to `ink` (`#000`), `surface` (`#fff`) and `surface-alt` (`#f7f7f7`). The design is monochrome, so `ink-muted`, `line` and `accent` are derived from `ink` to keep the existing primitives working. Inter is loaded from Google Fonts. `display` is 72/900 and `small` is 12px. Font weights now live on the type tokens, and `Heading` no longer hardcodes `font-semibold` or `tracking-tight`. The container is 90rem with 24px gutters, sections are 48px, and there's a pill radius.
- **Primitives** (`src/ui`): new `Panel`, `Logomark` and `NavLink`. `Section` gains `as` (section/header/footer) and `spacing` (section/gutter/bar). `Text` gains `as`, `size` and `weight`.
- **Hero**: optional `layout` field (`split` is the default, so existing content is unchanged; `panel` is new).
- **Chrome**: `SiteHeader`, `SiteFooter` and `Brand` in `src/lib`, fed by `getSiteSettings` (server fn) through the root route loader. The layout is a full-height flex column, so the footer sits at the bottom as in the frame.
- **Content**: `scripts/pages.ts` (`pnpm pages`) reads `design/manifest.json` and writes to the `production` dataset from `agency.json`:
  - `page-home`: `createOrReplace`, one `hero` block (`layout: panel`, heading "Page Title"). This replaces the starter seed blocks (hero, card grid, rich text) that were there before. No block types or documents were deleted.
  - `siteSettings`: patched with `siteName: "Name"` and `nav: Home → /, About → /about`. `footerText` ("© CSNF") is unset because the design has no slot for it. **Heads-up:** `siteName` was "CSNF". The Figma wordmark is literally "Name", which looks like placeholder copy. Change it in the Studio, or rename the layer text in Figma and re-run.
- `SanityImage.hotspot/crop` are typed `JsonValue` instead of `unknown` so site settings can be returned from a server function.

## Per-route notes

### `/` (frame "Template")

The screenshot matches the render after one pass: same header height (44px), logo/nav placement, 20px nav gap, hero panel inset (24px), radius (8px), height (240px), centred Inter 72/900 title, and a 143px footer with the stacked mark and wordmark.

Remaining differences:

- **Footer vertical position.** The render is the 1440×1024 Figma frame, and `pnpm shot` uses a 1440×900 viewport. The footer is pinned to the bottom of the viewport, so it sits 124px higher in the shot. Its distance from the bottom edge is identical.
- **Logomark** is a CSS ring (28px, 6px border in `currentColor`) rather than the Figma boolean vector. It looks the same. An uploaded `siteSettings.logo` replaces it.
- **Nav hover** gets an underline. Figma has no hover state.

## Lint warnings (from `manifest.lint`)

There is no separate `design/lint.json` in this run. These are the lint entries embedded in the manifest:

| Level | Node   | Layer      | Message                                                             |
| ----- | ------ | ---------- | ------------------------------------------------------------------- |
| warn  | `5:36` | Hero       | section is not auto-layout; spacing will be inferred from positions |
| info  | `5:8`  | Home       | text layer not named by role; field name will be generic            |
| info  | `5:9`  | About      | text layer not named by role; field name will be generic            |
| info  | `5:35` | Page Title | text layer not named by role; field name will be generic            |

Effect: hero spacing and the centring of the title were inferred from positions (panel 1392×240, title centred). The nav items and title map to generic `text`/`text2` fields in the manifest, so `scripts/pages.ts` treats every non-`wordmark` Header text as a nav link and takes the first Hero text as the heading.

## Could not map

- **`/about`**: the Header links to About, but the manifest has no About frame, so no `page-about` document was created and `/about` returns 404 until one exists.
- **Images**: `design/assets/` is empty and no section references an image, so nothing was uploaded. The script supports `images` on sections for future runs.
- **Link targets**: Figma has no prototype links, so the nav hrefs are inferred from the labels.
- **Responsive/mobile**: only a desktop frame exists. The header and hero use the same layout at every width, and the 72px title wraps with `text-balance` on narrow screens.

## Also noticed (not changed)

- The build warns that `createServerFn().inputValidator()` is deprecated in favour of `.validator()` in `src/lib/page.ts`. This predates the branch.
- The site reads through the Sanity CDN (`useCdn: true`), so content writes can take a short while to show up locally.
- In the existing `split` hero, the CTA button stretches to the column width because `Stack` is a flex column. This predates the branch and isn't used by this design.
