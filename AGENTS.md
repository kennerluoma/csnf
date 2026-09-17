# AGENTS.md — conventions for this repo

This repo is a client site generated from the agency starter: TanStack Start + React 19 + Tailwind 4 + Sanity, deployed to Cloudflare Workers. The Sanity Studio is a sibling app in `studio/` (its own Worker); it imports the schema from `src/sanity/schema`. Almost all code here is written by agents. Follow these rules exactly; they are what make generated code consistent.

## Commands

- `pnpm dev` · site on :3000 (needs `.env` with `VITE_SANITY_PROJECT_ID`) · `pnpm dev:studio` · studio on :3333 (needs `studio/.env`)
- `pnpm typecheck` · `pnpm lint` · `pnpm check` (oxfmt) · `pnpm build`
- `pnpm inventory` · regenerate the block inventory at the bottom of this file (run after adding a block)
- `pnpm sanity:typegen` · regenerate Sanity types after schema changes

## Architecture: the block system

- A `page` document = `title`, `slug`, `blocks[]`, `seo`. `slug = home` is `/`; any other slug is `/<slug>`.
- Each block is ONE folder in `src/blocks/<Name>/` containing:
  - `<Name>.schema.ts` · exports `<name>Schema` (a Sanity `object` type via `defineType`, with a one-sentence `description` saying when to use it) and `<name>Projection` (a GROQ conditional projection: `_type == "<name>" => { ...fields }`).
  - `<Name>.tsx` · exports the React component with props matching the projection.
- Every block is registered twice: its schema + projection in `src/blocks/schemas.ts` (no React; the studio imports this) and its component in `src/blocks/registry.ts`. Both alphabetical. Nothing else needs editing to add a block.
- Blocks are pure presentational components; they never fetch. A block that lists CMS documents gets its data from a resolver in `src/blocks/resolvers.ts` (block type → async function returning extra props; receives URL search params and site settings). Add a resolver there when a block needs documents.
- Shared object types (`link`, `imageWithAlt`, `richText`, `seo`) live in `src/sanity/schema/objects.ts`. Reuse them; don't redefine link/image shapes inside blocks.

## Content types (template v2)

Documents in `src/sanity/schema/documents.ts`: `artist`, `artwork`, `exhibition`, `event` (+ `eventSeries`, `venue`), `post`, `submission` (contact form, read-only). Live state: `isLive` / `nextUpcoming` in `src/lib/dates.ts` with `useNow()` for a ticking clock. Each has a detail route in `src/routes/<type>/$slug.tsx` (`/work/<slug>`, `/artists/<slug>`, `/exhibitions/<slug>`, `/events/<slug>`, `/news/<slug>`). Queries: `src/sanity/queries.ts`; TS shapes: `src/sanity/types.ts`.

- Index pages are blocks: `artworkGrid`, `artistList`, `exhibitionList`, `eventCalendar`, `postList`. When a design section lists works / exhibitions / events / news, map it to one of these (with `mode`, `limit`, `featuredOnly`, `view` as needed) instead of a `cardGrid` of hand-typed cards. `cardGrid` is only for things that are not CMS documents.
- `/work`, `/artists`, `/exhibitions`, `/events`, `/news` render a default page (one index block, `src/lib/defaults.ts`) when no `page` document with that slug exists. A `page` document with that slug replaces the default entirely. Nav links to these paths therefore never 404.
- Filters are URL search params rendered server-side (`?artist=…&year=…`, `?month=YYYY-MM&series=…`, `?tag=…`), so links are shareable. `FilterBar` in `src/ui` renders them.
- Images: project with `img('<field>')` from `src/sanity/queries.ts` so the `Image` primitive gets blur-up (lqip) and intrinsic size; pass `sizes` for anything not full-width. `imageWithAlt.caption` is a per-image caption.
- Artworks group by `collection` (Paintings, Works on Paper…); `artworkGrid` filters by it; `/works-on-paper` is a default index.
- Dates: only through `src/lib/dates.ts` (`fmtDate`, `fmtRange`, `fmtEventTime`, `monthGrid`, `toIcs`). Calendar feeds: `/ics/events` (all upcoming, `?series=`), `/ics/event/<slug>`.
- Forms: `contactForm` block posts to `/api/contact` (`src/routes/api/contact.tsx`: honeypot, optional Turnstile, stores a `submission`, emails `siteSettings.contactEmail` via Resend). `newsletterSignup` posts directly to the client's provider (`siteSettings.newsletter`). Both are plain HTML forms; no client JS.
- SEO: every route's `head()` uses `seoMeta()` from `src/lib/seo.ts` (document `seo` → document fields → `siteSettings.seo`). `/sitemap.xml` and `/robots.txt` are generated; previews on `*.workers.dev` are `noindex`.
- Site chrome (header/footer/nav/social) comes from the `siteSettings` document via `src/lib/SiteHeader.tsx`, `SiteFooter.tsx`, `Brand.tsx`, rendered in `__root.tsx`.

## Styling rules

- **Blocks never use raw Tailwind utilities for colour, type or radius.** They compose primitives from `src/ui/index.tsx` (see the inventory below). Layout utilities (`grid`, `flex`, `gap-*`, `max-w-*`, `aspect-*`, responsive prefixes) are fine in blocks.
- All colours, fonts, type sizes, radii and section spacing are tokens in `src/styles/tokens.css` (Tailwind `@theme`). Add a token rather than a one-off value. Prefer semantic names (`--color-ink`, `--color-surface`, `--color-accent`) and reference them as utilities (`bg-surface`, `text-ink-muted`, `text-display`).
- If a design needs a primitive that doesn't exist (e.g. `Quote`, `Stat`), add it to `src/ui/index.tsx` once, then use it from blocks. Restyle `Card` via tokens and props, never by forking it per block.

## Standards (a direction, not a fence)

These keep projects alike enough that a fix or a lesson from one applies to the next. Each has a reason; when a design genuinely needs something else, do that and say why in the PR.

**Always on (installed, enforced by lint, the build or CI)**

- **Class names go through `cn()`** (`src/lib/cn.ts`, clsx). Never build a class string with a template literal or `+`; lint fails on it. Static strings stay plain strings. Primitives own their styling: change one through a variant prop, not by passing conflicting utilities.
- **Interactive components start from Base UI** (`@base-ui/react`): dialog, popover, menu, select, tabs, accordion, tooltip, switch, checkbox, field, toast and so on. If Base UI has the component, wrap it as a primitive in `src/ui/index.tsx` and style it with tokens; don't hand-roll focus traps, roving tabindex or ARIA. Hand-written is fine only where Base UI has nothing (a lightbox's image logic, a calendar grid), and then keyboard and focus behaviour are part of the work. Not everything is a component: a link is still a link.
- **Accessibility is linted** (oxlint `jsx-a11y`): anything clickable is a `button` or a link, images have `alt`, form controls have labels.
- **React Compiler is on, and checked.** Don't write `useMemo`, `useCallback` or `memo` for performance. The build prints `React Compiler: N modules compiled` and fails at 0; `pnpm check:compiler` lists the files. Components must be named, capitalised functions (`component: HomePage`, not an inline arrow), or the compiler and the hooks lint skip them.
- **`useEffect` is the last resort, and never for data.** Data comes from route loaders; derived values are computed during render; reactions to user input live in the event handler; URL state lives in search params. An effect is right only for syncing with something outside React (a timer, a media query, an observer, a third-party widget); `src/lib/useNow.ts` is the model. Lint flags the common wrong uses.
- **State lives in the URL** (router search params) so it is shareable, prerender/ISR friendly and survives reload.
- **Fonts are self-hosted** (`public/fonts`, `@font-face` with `font-display: swap`, the one or two above-the-fold files preloaded in `__root.tsx`). No font CDNs. A font without a web licence is flagged, not shipped.
- **Motion respects `prefers-reduced-motion`**: transitions that move or scale things are wrapped in `motion-safe:` (or the Motion equivalent); opacity fades may stay.
- **Instant is a budget, not an adjective.** CI runs `pnpm budget` on the built site: JS under the gzip budget, and clicks on internal links make no document or server-function request and land within the click budget (`package.json` → `budgets`). Raise a budget only in a PR that says why.
- **Tooling:** oxlint (type-aware) and oxfmt; no ESLint or Prettier. `pnpm format` fixes, `pnpm lint` / `pnpm check` verify. House rules live in `tools/lint-plugin.js`.
- **Dependencies:** nothing younger than 7 days installs (`minimumReleaseAge` in `pnpm-workspace.yaml`); Dependabot opens one grouped PR a week with the same cooldown, and security advisories immediately; CI runs `pnpm audit`. Add a dependency only when the table below or the design calls for it; never bypass the age rule without saying so in the PR.

**Reach for these when the design needs the behaviour (not installed; add, and note it in the PR)**

| Need                                                                                       | Use                                                                                                                                        | Notes                                                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Animation                                                                                  | CSS transitions and keyframes first; **Motion** (`motion`) when it needs orchestration, layout animation, gestures or scroll-linked values |                                                                                                                                                                                                                   |
| Client-side data (search-as-you-type, polling, a live status, anything fetched after load) | **TanStack Query**                                                                                                                         | Never `fetch` in an effect. Page data still comes from loaders                                                                                                                                                    |
| Forms beyond the contact and newsletter forms                                              | **React Hook Form**                                                                                                                        | Only for multi-step or heavily validated forms; the simple ones stay plain HTML posts that work without JS. Base UI `Field` for markup and errors                                                                 |
| Client state the URL can't hold                                                            | A **pmndrs** store (`zustand`, or `valtio` / `jotai` if it fits better)                                                                    | Rare; say what the URL couldn't express                                                                                                                                                                           |
| Carousel / slider                                                                          | **CSS scroll-snap** (native momentum, no JS) with prev/next buttons                                                                        | Move to a library only when asked for looping, autoplay or synced thumbnails: then **Splide** (better drag feel) or **Embla** (smaller, headless); say which and why, a person judges feel vs size on the preview |
| Maps                                                                                       | A static map image linking out; **MapLibre GL** (lazy-loaded) if it must be interactive                                                    | Rare on these sites. No API-key SDKs without asking                                                                                                                                                               |
| Dates                                                                                      | `src/lib/dates.ts` (Intl)                                                                                                                  | No date library                                                                                                                                                                                                   |

Anything not listed: prefer no dependency, then the smallest well-maintained one, and flag it under "Things to check".

## Rendering (prerender or ISR, never per-request)

- Every clean URL reachable from `/` is prerendered to static HTML at build (`vite.config.ts` → `prerender.crawlLinks`) and served as an asset. Content edits redeploy via the Sanity webhook.
- URLs with a query string (filters, months, pagination) and any slug the crawler missed render once at the edge and are cached by `src/server.ts` for the `s-maxage` set on the root route (60s, stale-while-revalidate a day). Never remove the root `headers()`; never make a route depend on per-request data (cookies, time of day) without a `Cache-Control: private` header on that route.
- **In-app clicks must not wait on the network.** Every loader server function carries `.middleware([staticData])` (`src/lib/staticData.ts`): `pnpm build` writes each result to `/static-data/<hash>.json`, the browser reads that file instead of calling the Worker, and links preload it as they scroll into view. A new `createServerFn` used by a route loader gets the middleware too; the loader input must be the same on server and client (no `undefined` vs `{}` differences, no request-derived values). `src/server.ts`, `src/lib/staticData.ts` and `scripts/static-data.ts` are template-owned: wire them, don't edit them.
- Internal links use the `A`/`NavLink`/`Button`/`Card` primitives (router `Link`, preloaded in the viewport; query-string links on intent). Plain `<a href="/…">` is a full page load and is wrong in this repo.
- The browser bundle must not import `@sanity/client`: `urlFor` is config-only; server code imports the client from `src/sanity/client.ts` in server functions only.

## Data

- Fetch via `createServerFn` in `src/lib/page.ts` (do not name files `*.server.ts`; Start blocks importing those from routes), queries in `src/sanity/queries.ts`. Server functions must return plain JSON (Portable Text is typed as `Array<AnyBlock>` for this reason).
- Images: always `imageWithAlt`; render with the `Image` primitive (handles Sanity CDN URLs).
- Document ids: top-level, hyphenated (`page-home`, `artist-mara-lindqvist`). Never dotted ids; the public read role can't see them.
- GROQ params: never name a param `$tag` (`tag` is a reserved client option); use `$tagFilter`.

## Scripts

- `pnpm extract` · Figma → `design/manifest.json` + `design/renders/*.png` (needs `FIGMA_TOKEN`); `--from-file <figma.json>` offline; `--normalise design/manifest.json` re-runs the normaliser on a plugin-exported manifest; `--from-fig <file.fig> [--page NAME]` reads a local Figma export (no API; no renders)
- `pnpm shot [url]` · Playwright screenshots of every route → `design/shots/*.png`
- `pnpm seed` · write seed documents of every type to Sanity (needs `SANITY_WRITE_TOKEN`) · `pnpm pages` · write page documents from the manifest

## Lessons

`.agency/lessons.md` holds rules learned from previous client sites (maintained by `agency learn`). Read it before planning or fixing; it overrides your defaults where they disagree.

## Design translation (what the runner executes)

Input: `design/manifest.json` (from Figma) and `design/renders/*.png`. Optional first pass: `.agency/prompts/plan.md` writes `design/plan.md` (block plan). Main pass: `.agency/prompts/translate.md`. Output: tokens, blocks, page documents in Sanity, a branch and a PR. Never push to `main`.

## Fidelity

`agency.json` → `fidelity`: `normalised` (default; the extractor learns the design's own spacing base and anchors, snaps spacing/radii/type sizes to them, merges near-duplicate colours, and lists every change under `manifest.normalisation.snapped`) or `exact`. In normalised mode, differences inside the snapped tolerances are not defects and never justify a new block or a token override.

## Rebuilds

`design/mapping.json` maps Figma section ids to block files, page documents and block keys. `design/manifest.prev.json` is the manifest from the previous run. A rebuild changes only what changed between the two manifests; everything else, including hand edits on `main`, stays untouched. Client edits made in the studio win over re-seeded content.

## Quality bar

`pnpm typecheck && pnpm lint && pnpm build` must pass before a commit; the build line `React Compiler: N modules compiled` must be there. oxfmt formats everything (`pnpm format`). CI also runs `pnpm budget` and `pnpm audit`. Run `pnpm inventory` after adding a block so the table below is current.

## Block inventory

<!-- inventory:start -->

_Generated by `pnpm inventory` from `src/blocks/schemas.ts`; do not edit by hand. 10 blocks._

| Block              | Folder                         | Use for                                                                                                                                                                                                             | Fields (`*` required)                                                                                                       |
| ------------------ | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `artistList`       | `src/blocks/ArtistList/`       | Index of artist documents (portrait + name), alphabetical. Use for "Artists", "Represented artists" or "Roster" sections. Single-artist sites do not need it.                                                       | eyebrow, heading, columns (2/3/4)                                                                                           |
| `artworkGrid`      | `src/blocks/ArtworkGrid/`      | Index of artwork documents with optional filters (artist, year, medium, tag). Use for any "Work", "Collection" or "Selected works" section; items come from the CMS, not from the block.                            | eyebrow, heading, intro, columns (2/3/4), collection, limit: number, featuredOnly: boolean, showFilters: boolean, cta: link |
| `cardGrid`         | `src/blocks/CardGrid/`         | Repeated cards (title, body, image, link) in 2–4 columns with an optional heading. Use for features, services, team, logos-with-captions: any hand-entered repeated item that is not a CMS document.                | eyebrow, heading, columns (2/3/4), cards: {title*, body, image: imageWithAlt, link: link}[]                                 |
| `contactForm`      | `src/blocks/ContactForm/`      | Name / email / subject / message form posting to /api/contact (stored in Sanity as `submission`, emailed to siteSettings.contactEmail). Use for any "Contact", "Get in touch" or "Enquire" section that has inputs. | eyebrow, heading, intro, showSubject: boolean, buttonLabel, successMessage, aside: richText                                 |
| `eventCalendar`    | `src/blocks/EventCalendar/`    | Index of event documents as a month grid and/or upcoming list, filterable by series (?series=) and month (?month=YYYY-MM). Use for any "Events", "What's on" or "Calendar" section.                                 | eyebrow, heading, view (list/month/both), limit: number, showFilters: boolean, cta: link                                    |
| `exhibitionList`   | `src/blocks/ExhibitionList/`   | Index of exhibition documents split into current / upcoming / past by date. Use for any "Exhibitions", "On now" or "Programme" section. `mode` picks which groups to show.                                          | eyebrow, heading, mode (current/currentUpcoming/all/past), pastLimit: number, cta: link                                     |
| `hero`             | `src/blocks/Hero/`             | Page-top statement: eyebrow, heading, body, one CTA, one image. `split` = text beside image; `panel` = centred in a tinted rounded panel. Use for the first section of any route.                                   | layout (split/panel), eyebrow, heading*, body, cta: link, image: imageWithAlt                                               |
| `newsletterSignup` | `src/blocks/NewsletterSignup/` | Email field posting straight to the client's provider (siteSettings.newsletter: Mailchimp, Buttondown, ConvertKit, Klaviyo). Use for any "Subscribe" / "Stay in touch" section with a single email input.           | eyebrow, heading, body, buttonLabel, tone (default/alt/ink)                                                                 |
| `postList`         | `src/blocks/PostList/`         | Index of news post documents, newest first, optionally filtered by tag (?tag=). Use for "News", "Journal" or "Blog" sections.                                                                                       | eyebrow, heading, limit: number, columns (2/3), cta: link                                                                   |
| `richTextBlock`    | `src/blocks/RichText/`         | Portable Text with an optional heading. Use for prose sections: about text, statements, long copy.                                                                                                                  | heading, content: richText                                                                                                  |

Primitives in `src/ui/index.tsx`: `A`, `Section`, `Panel`, `Container`, `Stack`, `Grid`, `Heading`, `Eyebrow`, `Text`, `NavLink`, `Logomark`, `Button`, `Image`, `RichText`, `Badge`, `Card`, `FilterBar`, `Field`, `SubmitButton`, `Calendar`, `Meta`.
<!-- inventory:end -->
