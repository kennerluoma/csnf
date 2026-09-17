# AGENTS.md — conventions for this repo

This repo is a client site generated from the agency starter: TanStack Start + React 19 + Tailwind 4 + Sanity, deployed to Cloudflare Workers. The Sanity Studio is a sibling app in `studio/` (its own Worker); it imports the schema from `src/sanity/schema`. Almost all code here is written by agents. Follow these rules exactly; they are what make generated code consistent.

## Commands

- `pnpm dev` · site on :3000 (needs `.env` with `VITE_SANITY_PROJECT_ID`) · `pnpm dev:studio` · studio on :3333 (needs `studio/.env`)
- `pnpm typecheck` · `pnpm lint` · `pnpm check` (prettier) · `pnpm build`
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

Documents in `src/sanity/schema/documents.ts`: `artist`, `artwork`, `exhibition`, `event` (+ `eventSeries`), `post`, `submission` (contact form, read-only). Each has a detail route in `src/routes/<type>/$slug.tsx` (`/work/<slug>`, `/artists/<slug>`, `/exhibitions/<slug>`, `/events/<slug>`, `/news/<slug>`). Queries: `src/sanity/queries.ts`; TS shapes: `src/sanity/types.ts`.

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

`pnpm typecheck && pnpm lint && pnpm build` must pass before a commit. Prettier formats everything (`pnpm format`). Run `pnpm inventory` after adding a block so the table below is current.

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

Primitives in `src/ui/index.tsx`: `Section`, `Panel`, `Container`, `Stack`, `Grid`, `Heading`, `Eyebrow`, `Text`, `NavLink`, `Logomark`, `Button`, `Image`, `RichText`, `Badge`, `Card`, `FilterBar`, `Field`, `SubmitButton`, `Calendar`, `Meta`.
<!-- inventory:end -->
