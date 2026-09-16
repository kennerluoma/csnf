# AGENTS.md — conventions for this repo

This repo is a client site generated from the agency starter: TanStack Start + React 19 + Tailwind 4 + Sanity, deployed to Cloudflare Workers. The Sanity Studio is a sibling app in `studio/` (its own Worker); it imports the schema from `src/sanity/schema`. Almost all code here is written by agents. Follow these rules exactly; they are what make generated code consistent.

## Commands

- `pnpm dev` · site on :3000 (needs `.env` with `VITE_SANITY_PROJECT_ID`) · `pnpm dev:studio` · studio on :3333 (needs `studio/.env`)
- `pnpm typecheck` · `pnpm lint` · `pnpm check` (prettier) · `pnpm build`
- `pnpm sanity:typegen` · regenerate Sanity types after schema changes

## Architecture: the block system

- A `page` document = `title`, `slug`, `blocks[]`. `slug = home` is `/`; any other slug is `/<slug>`.
- Each block is ONE folder in `src/blocks/<Name>/` containing:
  - `<Name>.schema.ts` · exports `<name>Schema` (a Sanity `object` type via `defineType`) and `<name>Projection` (a GROQ conditional projection: `_type == "<name>" => { ...fields }`).
  - `<Name>.tsx` · exports the React component with props matching the projection.
- Every block is registered twice: its schema + projection in `src/blocks/schemas.ts` (no React; the studio imports this) and its component in `src/blocks/registry.ts`. Both alphabetical. Nothing else needs editing to add a block.
- Shared object types (`link`, `imageWithAlt`, `richText`) live in `src/sanity/schema/objects.ts`. Reuse them; don't redefine link/image shapes inside blocks.

## Styling rules

- **Blocks never use raw Tailwind utilities for colour, type or radius.** They compose primitives from `src/ui/index.tsx` (`Section`, `Container`, `Stack`, `Grid`, `Heading`, `Eyebrow`, `Text`, `Button`, `Image`, `RichText`). Layout utilities (`grid`, `flex`, `gap-*`, `max-w-*`, `aspect-*`, responsive prefixes) are fine in blocks.
- All colours, fonts, type sizes, radii and section spacing are tokens in `src/styles/tokens.css` (Tailwind `@theme`). Add a token rather than a one-off value. Prefer semantic names (`--color-ink`, `--color-surface`, `--color-accent`) and reference them as utilities (`bg-surface`, `text-ink-muted`, `text-display`).
- If a design needs a primitive that doesn't exist (e.g. `Badge`, `Quote`), add it to `src/ui/index.tsx` once, then use it from blocks.

## Data

- Fetch via `createServerFn` in `src/lib/page.ts` (do not name files `*.server.ts`; Start blocks importing those from routes), queries in `src/sanity/queries.ts`. Blocks are pure presentational components; they never fetch.
- Images: always `imageWithAlt`; render with the `Image` primitive (handles Sanity CDN URLs).
- Document ids: top-level, hyphenated (`page-home`). Never dotted ids; the public read role can't see them.

## Scripts

- `pnpm extract` · Figma → `design/manifest.json` + `design/renders/*.png` (needs `FIGMA_TOKEN`)
- `pnpm shot [url]` · Playwright screenshots of every route → `design/shots/*.png`
- `pnpm seed` · write seed documents to Sanity (needs `SANITY_WRITE_TOKEN`)

## Design translation (what `translate.yml` runs)

Input: `design/manifest.json` (from Figma) and `design/renders/*.png`. Task prompt: `.agency/prompts/translate.md`. Output: tokens, blocks, page documents in Sanity, a branch and a PR. Never push to `main`.

## Quality bar

`pnpm typecheck && pnpm lint && pnpm build` must pass before a commit. Prettier formats everything (`pnpm format`).
