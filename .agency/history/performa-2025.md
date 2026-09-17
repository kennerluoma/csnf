# Performa 2025 (performa-2025)

Repo: https://github.com/kennerluoma/performa-2025

## Fix sessions

### PR #11 fix: #10 (fix/20260917-0519) (merged)

## Summary

One issue in this batch (#10), one commit. Nothing overlaps or conflicts. Two deviations from the issue text are explained below: `src/server.ts` is not a verbatim copy, and the prerender filter is stricter.

### #10 Performance: prerender, ISR and client-side navigation (template a2b8e36)

**What changed**

1. `vite.config.ts`: `tanstackStart({ prerender: { enabled: true, crawlLinks: true, filter } })`. **Deviation:** the filter is `!/^\/(api|ics)\//.test(p.path) && !p.path.includes('?')`, not the issue's exact filter. With the issue's version the build ran out of memory after about 10 minutes. Start's crawler follows query-string links, and on /calendar every row, chip and filter combination is one. It also doesn't decode `&amp;`, so the URLs kept growing (`/calendar?filters=1%2F&amp;amp%3Bamp%3B…`). Worse, it writes each of those pages to the query-stripped path, so `/calendar/index.html` would have held some random filtered state. Query-string URLs are ISR by design (AGENTS.md → Rendering), so leaving them out of prerender is the intended behaviour. The template probably wants the same change (see Follow-ups).
2. `wrangler.jsonc`: `main: "./src/server.ts"` and `assets: { html_handling: "drop-trailing-slash", binding: "ASSETS", run_worker_first: ["/*", "!/assets/*"] }`.
3. `src/server.ts`: new Worker entry. **Not a verbatim copy of the template file.** This session couldn't read kennerluoma/csnf (`gh` and web fetch weren't permitted), so I wrote it from the behaviour the issue describes:
   - Clean URLs are served from `ASSETS`. On a 404 they fall through to rendering.
   - Query-string URLs (and slugs the crawler missed) render once through Start and go into `caches.default` for the route's `s-maxage`. After that they're served stale for `stale-while-revalidate` while `waitUntil` re-renders in the background. The `x-isr` header is `miss`, `hit` or `stale`.
   - Only 200 responses with a public `s-maxage` and no `Set-Cookie` are stored.
   - `/_serverFn/*`, `/api/*` and `/ics/*` pass straight through, uncached. This isn't in the issue, but without it client-side navigation broke. Router loaders fetch through `GET /_serverFn/…?payload=`, which has a query string, so those requests were going down the ISR path, losing their headers and getting 403 ("Something went wrong!" after clicking any link). They must never be shared-cached anyway.
   - **Please diff this file against the template's `src/server.ts` before merging** and take the template's version if they differ in anything but the `_serverFn` exclusion.
4. `src/routes/__root.tsx`: `headers: () => ({ 'Cache-Control': 'public, max-age=0, s-maxage=60, stale-while-revalidate=86400' })`.
5. `src/sanity/image.ts`: `imageUrlBuilder({ projectId, dataset })`, with no client import. No file in `dist/client/assets` contains `apicdn.sanity.io` or `@sanity/client`.
6. `src/ui/index.tsx`: new `A` primitive. Internal paths, with or without a query or hash, render a router `Link` via `href`, so they navigate client-side and preload on hover (`defaultPreload: 'intent'`). External URLs, `#hash`, `/api` and `/ics` stay plain anchors.
   - `A` sets `activeOptions: { exact: true, includeSearch: true }`. Without it, `Link` would add `aria-current="page"` to fuzzy matches (every link to `/` is always active), which would change the header underline and the selected-row styling.
   - Now routed through `A`: `NavLink`, `Button`, `Card`, `Calendar` cells, `SoftLink`, `Row` (list rows on /calendar, /commissions, /broadcast, `?event=` / `?item=` selection), `Tile` (home screen tiles), `Brand` (header wordmark), `CardGrid` card titles, the not-found page link, and the artist and tag links on `/work/$slug`, `/exhibitions/$slug` and `/news/$slug`.
   - `SoftLink` (the /artists roster, Close links and `Chip` filters) is now `A` with `resetScroll={false}` instead of a hand-rolled `router.navigate`, so selection links are real router links and keep the scroll position.
   - No raw `<a href="/…">` is left in `src` outside `A`.

**Checked**

- `pnpm typecheck && pnpm lint && pnpm build` pass. The build prints `[prerender]` lines for 13 pages (`/`, `/artists`, `/broadcast`, `/calendar`, `/commissions`, `/the-hub`, `/consortium`, `/tickets`, `/performa-studio`, plus trailing-slash variants), and `dist/client/calendar/index.html` exists.
- `wrangler dev` on the build (same as `pnpm preview`):
  - `HEAD /calendar`: 200, no `x-isr`, 4–34 ms.
  - `HEAD /calendar?type=music`: `x-isr: miss` (463 ms), then `x-isr: hit` (7 ms).
  - `/ics/events`: 200 `text/calendar`, uncached.
  - Filtering still works through ISR: `/calendar` lists 13 events, `?type=Dance` and `?type=Free` list 1 each.
- Playwright on the build at 1440 and 390 wide. A `window` marker survived every click, so none was a full page load:
  - home tile → /commissions
  - header → /calendar, /broadcast, /artists; wordmark → /
  - /calendar row (`?event=`), Filter chip, Type chip
  - /artists roster row (`?artist=`)
  - at 390: Index overlay → /calendar → row → Close
  - No page errors. Selecting a row 600 px down keeps the scroll at 600.
- `pnpm shot` (dev): /, /calendar, /artists and /commissions look the same as before at desktop. A 390 px shot of /calendar with an event selected shows the record pane with Close.

**How to check in the preview**

- DevTools → Network, filter "Doc". Click between Calendar, Artists, Broadcast and the home tiles, and select a calendar row: no new document requests, only `_serverFn` fetches.
- `curl -sI <preview>/calendar` has no `x-isr`. Run `curl -sI '<preview>/calendar?type=Music'` twice: `miss`, then `hit`.

## Not resolved

- **Verbatim template `src/server.ts` (step 3):** the template repo wasn't readable from this session. The file here implements the behaviour the issue describes and passes the checks above, but it isn't the template's code. Reviewer: copy the template's file over it, keeping `_serverFn` in the pass-through list if the template lacks it, or confirm this version is fine.
- **"First byte under 200 ms" on the deployed Worker:** only measured locally (4–34 ms for clean URLs, about 7 ms for cached query URLs). Please confirm on the `*.workers.dev` preview.

## Follow-ups

- **Template prerender filter:** csnf's `vite.config.ts` probably has the same crawler blow-up on any site whose index screens link to query-string states. Add `&& !p.path.includes('?')` there too.
- **/broadcast and "Happening today" freeze at build time:** `/broadcast` picks the live broadcast with `Date.now()` / `liveEventQuery(now)`, and `/calendar`'s "Happening today" uses today's date. Both are prerendered now, so they only change on redeploy. Two options: a scheduled redeploy (hourly during the festival), or computing live/today on the client from the full list.
- **`/artists/<slug>` and other detail pages aren't prerendered:** the crawler only reaches them through links in `?artist=` states, which are no longer crawled. They render on first request through ISR. If they should be static, list them in `prerender.pages` from a Sanity query at build time.
- **`/sitemap.xml` returns 500** (`HTTPError` from the Sanity fetch) on both the dev server and the preview. It isn't caused by this change, but the sitemap is broken. Also: its `defaultIndexSlugs` map has no key for `works-on-paper`, so `d[undefined]` would throw once the query succeeds.
- **`design/manifest.json` lists `/mobile-cal`, `/red-alt` and `/notes` as routes:** `pnpm shot` requests them and gets "Page not found". `mobile-cal` is the 390 px state of `/calendar` and `red-alt` is `/broadcast`. The manifest (or `shot.ts`) should map them to real paths and viewports so mobile shots are meaningful.
- **AGENTS.md → Rendering section:** it was already modified in the working tree before this session and is left uncommitted. It documents exactly these rules, so it probably belongs in this PR.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Closes #10

## Issues

### #10 Performance: prerender, ISR and client-side navigation (template a2b8e36) [closed] bug, in-session

Page loads are far slower than the previous production site (performa2025.org): every link is a full page load rendered on the Worker with live Sanity fetches, and the Sanity client ships in the browser bundle.

The template now fixes this (kennerluoma/csnf commits b0d76a4 and a2b8e36). Port the same changes into this repo:

1. `vite.config.ts`: `tanstackStart({ prerender: { enabled: true, crawlLinks: true, filter: (p) => !/^\/(api|ics)\//.test(p.path) } })`.
2. `wrangler.jsonc`: `main: "./src/server.ts"` and `assets: { html_handling: "drop-trailing-slash", binding: "ASSETS", run_worker_first: ["/*", "!/assets/*"] }`.
3. `src/server.ts`: copy the template's file verbatim (Worker-first: clean URLs from ASSETS, query-string URLs rendered once and cached in the Workers Cache API per `s-maxage`, stale-while-revalidate).
4. `src/routes/__root.tsx`: add `headers: () => ({ 'Cache-Control': 'public, max-age=0, s-maxage=60, stale-while-revalidate=86400' })`.
5. `src/sanity/image.ts`: `imageUrlBuilder({ projectId, dataset })` (no client import) so `@sanity/client` leaves the browser bundle.
6. Add the template's `A` primitive to `src/ui/index.tsx` (router `Link` for internal paths, plain anchor otherwise) and route every internal `<a href>` in the site through it, including `NavLink`, `Button`, `Card`, the header, the list rows on /calendar, /commissions, /broadcast, /artists, and the tiles on the home screen. Search-param selection links (`?event=…`) must be router links too so selecting an item never reloads the page.
7. Verify: `pnpm build` prints `[prerender]` lines and `dist/client/calendar/index.html` exists; `pnpm preview` then `curl -sI localhost:8787/calendar` (200, no x-isr) and `curl -sI 'localhost:8787/calendar?type=music'` twice (x-isr: miss then hit). Check `/calendar` still filters correctly with query params.

Target: first byte under 200 ms on clean URLs and no full page load when clicking between routes.

### #9 Formatting: [open] design-gap, from-agent

`scripts/extract.ts` has a prettier-only change in the working tree that I left uncommitted (it isn't part of this design).

_From the build agent's checklist on https://github.com/kennerluoma/performa-2025/pull/1._

### #8 Dismissal: [open] design-gap, from-agent

dismissing "RADICAL BROADCAST ×" hides the header item and the live bar for the browser session. Turn both off permanently with `siteSettings.broadcast.active`.

_From the build agent's checklist on https://github.com/kennerluoma/performa-2025/pull/1._

### #7 URLs: [open] design-gap, from-agent

the design calls the index `/calendar`, and the template's `/events` default index still exists. Event detail stays at `/events/<slug>`, with the template's default styling.

_From the build agent's checklist on https://github.com/kennerluoma/performa-2025/pull/1._

### #6 Interaction and mobile were not in the design: [open] design-gap, from-agent

**Interaction and mobile were not in the design:**

- Mobile uses an "Index / Close" overlay instead of the drawn hamburger.
- Selection opens in place (search param) rather than navigating.
- Should the live bar also appear under the nav on other screens, as in Commissions `552:7657`?
- Should the search icon do anything?

_From the build agent's checklist on https://github.com/kennerluoma/performa-2025/pull/1._

### #5 Empty pages created so nav and tiles don't 404: [open] design-gap, from-agent

`/the-hub`, `/consortium`, `/tickets`, `/performa-studio`. The home tile "Lithuania Pavilion" links to `/calendar?series=lithuanian-pavilion`, which has no events yet.

_From the build agent's checklist on https://github.com/kennerluoma/performa-2025/pull/1._

### #4 Image pairings are guesses: [open] design-gap, from-agent

**Image pairings are guesses:**

- The yellow-dancer stage still → Diane Severin Nguyen
- The statue → Aria Dean (Luisen-Denkmal)
- Dancers in white → Sojung Jun
- The hooded figure → Ayoung Kim
- One design image (`d2bc997edab2c3fa.jpg`, the Pakui Hardware row) is missing from `design/assets`.

_From the build agent's checklist on https://github.com/kennerluoma/performa-2025/pull/1._

### #3 Placeholder / sample copy: [open] design-gap, from-agent

**Placeholder / sample copy:**

- Aria Dean's tagline "Peforma Commission" is seeded as-is, typo included.
- The body under Diane Severin Nguyen's commission describes Barnett Cohen's _im a pause im a fiction…_. Its credits and "Performa Biennial 2023" credit line come from that same sample.
- Every row reads "2 pm (60 min.) / 351 Canal St".
- The calendar supporters copy is for Performa Biennial 2023.
- Not seeded: the Walking Tours state (ARTIST NAME, Lorem Ipsum), 19 × "Description", and the filler rows "Algorithm ocean true blood moves" (Diane Severin Nguyen / Camille Henrot).

_From the build agent's checklist on https://github.com/kennerluoma/performa-2025/pull/1._

### #2 Fonts: [open] design-gap, from-agent

Theinhardt and Fugue are commercial. The site falls back to Inter and Space Grotesk until licensed woff2 files are self-hosted under those family names.

_From the build agent's checklist on https://github.com/kennerluoma/performa-2025/pull/1._
