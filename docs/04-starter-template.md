# 04 · Starter template (`agency-starter`)

The fixed target. Rigid on purpose. Every client repo is generated from it.

## Stack (best guess; doc 08 Q3)

| Concern      | Choice                                                                       | Why                                                                                                                                                                               |
| ------------ | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework    | **TanStack Start**, fully prerendered; `/studio` as an SPA-only route        | same router as the admin; static output keeps us on Pages with free branch previews. Confirm prerender + SPA-route combo at scaffold time; fallback is Workers with static assets |
| Styling      | **Tailwind 4 + CSS variables** in `src/styles/tokens.css`                    | one place for the agent to write the colours and type it pulls from the design                                                                                                    |
| CMS          | **Sanity v4, embedded studio at `/studio`**, TypeGen, Presentation tool      | one repo, one deploy; client logs in at `<site>/studio`                                                                                                                           |
| Hosting      | **Cloudflare Pages, direct upload from Actions** via `wrangler pages deploy` | no git integration needed; branch previews for free                                                                                                                               |
| Visual tests | **Playwright + pixelmatch**                                                  | the agent's verification loop                                                                                                                                                     |
| Quality      | TS strict, ESLint, Prettier, enforced in `ci.yml`                            | generated and hand-written code look the same                                                                                                                                     |
| Tooling      | pnpm                                                                         | workspace-friendly for the platform monorepo                                                                                                                                      |

Decided 2026-09-16 over vinext (Next-compat on Vite): no Next code to be compatible with, and the agent writes blocks, not framework code, so model familiarity with the framework barely matters.

## Layout

```
agency-starter/
├── AGENTS.md                   # conventions + mapping rules (the agent's system context)
├── .agency/prompts/translate.md
├── agency.json                 # { slug, figmaFileKey, sanityProjectId, ... } — written by provisioning
├── design/                     # manifest.json, renders/, assets/, pr-body.md   (agent-owned)
├── src/
│   ├── routes/index.tsx, $.tsx # home + catch-all: fetch page by slug, render blocks
│   ├── blocks/                 # Hero/, RichText/, CardGrid/ + schemas.ts (no React) + registry.ts (components)
│   ├── ui/index.tsx            # Section, Container, Stack, Grid, Heading, Eyebrow, Text, Button, Image, RichText
│   ├── styles/tokens.css       # Tailwind @theme tokens; the agent writes these
│   ├── lib/                    # server fns (getPage), PageView
│   └── sanity/                 # client, env, image, queries, types, schema/
├── studio/                     # Sanity Studio app: sanity.config.ts imports ../src/sanity/schema; own wrangler.jsonc
├── wrangler.jsonc              # site Worker
├── .github/workflows/
│   ├── deploy.yml              # push: build → main? wrangler deploy (+ studio) : versions upload --preview-alias
│   ├── translate.yml           # workflow_dispatch: extract → claude -p → PR   (doc 03)   [not yet written]
│   └── ci.yml                  # prettier, lint, typecheck, build
└── tests/visual/               # playwright config + pixelmatch helper                   [not yet written]
```

## The block system

`page` document = `title, slug, blocks[]`. Each block = Sanity object type + React component + GROQ fragment, registered in `registry.ts`. The catch-all route renders `blocks.map(b => Registry[b._type])`. Blocks compose only `src/ui` primitives; primitives are the only place raw Tailwind lives. A generated block and a hand-written block are indistinguishable.

## Ships with

Three example blocks, `siteSettings` singleton (nav, footer, logo), `deploy.yml` deploying every branch to its own Worker preview alias and `main` to production plus the studio Worker. Still to add: `translate.yml`, Playwright visual tests, Presentation tool.

## Not in the template

Auth, forms backend, commerce, i18n. Per-client, after generation.
