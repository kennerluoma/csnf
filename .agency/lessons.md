# Lessons

Rules learned from previous client sites, applied on the first build of the next one. Maintained by `agency learn` (reads closed issues and fix PRs across projects) and by hand. One line each; cite the projects. The prompts tell the agent to read this file first.

## Layout

- A design with viewport-sized frames and no vertical stack is an app-like screen: build a route layout over the content types, not blocks. — alex-olson
- Repeated frames with the same name are states of one route (hover, selection, open menu, a different item), never separate pages. — alex-olson

## Mobile

- Designs rarely draw mobile for screen layouts; production always needs it: stack the columns, hide the index column on detail views, turn the nav into an "Index / Close" overlay. — alex-olson

## Type

- Bespoke sites scale type and the large spacing values with the viewport from the design's frame width; express them as `clamp(min, vw, max)`, not fixed px. — alex-olson
- A "Trial" font in the design is a licence problem, not a font choice: fall back to a licensed family and flag it. — alex-olson

## Images

- Captions are a layout element with their own placement per viewport (rotated along the image edge, under it, in a lightbox), and the most-revised part of gallery sites after launch. — alex-olson
- Every image needs blur-up and `srcset`; project images with `img()` so the primitive has the asset metadata. — alex-olson

## Content model

- Artists split works by medium ("Paintings", "Works on Paper"): that is `artwork.collection`, not a second document type. — alex-olson
- Exhibitions carry a press-release PDF and per-image captions. — alex-olson

## Interaction

- A frame named Intro/Splash is a dismissable overlay on the front page, not a route. — alex-olson
- Galleries need a full-screen lightbox with prev/next, an index counter and close, even when only one state hints at it. — alex-olson

## Process

- Placeholder rows repeated N times in a design ("Project title / 2022") are not content; do not seed them, flag them. — alex-olson
- The design is usually older than the client's expectations; assume interaction and mobile were decided later and ask in the PR body. — alex-olson
