# Lessons

Rules learned from previous client sites, applied on the first build of the next one. Maintained by `agency learn` (reads closed issues and fix PRs across projects) and by hand. One line each; cite the projects. The prompts tell the agent to read this file first.

## Layout

- A design with viewport-sized frames and no vertical stack is an app-like screen: build a route layout over the content types, not blocks. — alex-olson
- Frames that repeat a route under a variant name (same name, `-alt`, `mobile-…`, a misspelt copy like `/exhibitionsings`) are states or viewports of that route, never separate pages. — alex-olson, performa-2025
- The template's default indexes and detail routes (`/work`, `/events`, `/events/<slug>`…) stay live even when the design names its own index (`/paintings`, `/calendar`): style the detail routes of every content type the site uses with the screen's primitives, and list any default index the nav doesn't link in the PR body. — alex-olson, performa-2025

## Mobile

- Designs rarely draw mobile; production always needs it. Split screens stack below `lg` (1024px), not `md`: between 768 and 1023px half-width panes would get mobile-sized type. The mobile nav (a wrapping nav or an "Index / Close" overlay) is the client's call: build one, and ask in the PR body. — alex-olson, performa-2025

## Type

- Bespoke sites scale type, header height and the large spacing values with the viewport, in tokens: `max(floor, <px ÷ frame width × 100>vw)` below 1024px and plain `vw` above it, with no upper cap (the client wants 1920 to be a bigger 1512, not a capped one). — alex-olson
- Letter-spacing in `em` goes on every element (`@layer base`), not on `body`: an inherited `em` value is computed once at the body's font size. — alex-olson
- A Trial or commercial font in the design (Lars Trial, Theinhardt, Fugue) is a licence question, not a font choice: list the real family first in `--font-*`, fall back to a close free family, and ask whether to buy it. — alex-olson, performa-2025

## Images

- Captions are a layout element with their own placement per viewport (rotated along the image edge, under it, in a lightbox), and the most-revised part of gallery sites after launch. — alex-olson
- Every image needs blur-up and `srcset`; project images with `img()` so the primitive has the asset metadata. — alex-olson
- Design images carry no metadata. Title works only from a caption layer, not a layer name ("Rectangle 12"). Seed the rest as "Untitled NN", and put every guessed image → document pairing and every missing asset in one table in the PR body. — alex-olson, performa-2025

## Content model

- Artists split works by medium ("Paintings", "Works on Paper"): that is `artwork.collection`, not a second document type. — alex-olson
- Exhibitions carry a press-release PDF and per-image captions. — alex-olson

## Interaction

- A frame named Intro/Splash is a dismissable overlay on the front page, not a route. Anything dismissable (intro, live bar) remembers the dismissal for the session and has a `siteSettings` switch to turn it off for good. — alex-olson, performa-2025
- Galleries need a full-screen lightbox with prev/next, an index counter and close, even when only one state hints at it. — alex-olson
- Selecting an item on a screen (a row, a thumbnail) is a search-param link (`?event=<slug>`) through `A` with `resetScroll={false}`. It is shareable and ISR-cached, and it doesn't reload the page or jump the scroll. — performa-2025
- Pages are prerendered, so "live now", "happening today" and countdowns are computed in the browser with `useNow()` + `isLive` / `nextUpcoming` over the full list, never with `Date.now()` in a loader. — performa-2025

## Process

- Repeated placeholder rows ("Project title / 2022" ×9, "2 pm (60 min.) / 351 Canal St" on every row, "Description" ×19) and copy lifted from another item or a past edition are not content. Do not seed them, never invent a field (a date, a venue) to make a document valid, and flag them. — alex-olson, performa-2025
- The design is usually older than the client's expectations: assume interaction and mobile were decided later, and ask about them in the PR body. — alex-olson, performa-2025
