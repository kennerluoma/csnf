# Agency platform — Figma → React + Sanity, from a dashboard

**The idea.** A designer finishes a site in Figma. You open the admin, create a project, paste the Figma link, click **Build**. Minutes later there's a live preview of a React site on Cloudflare, a Sanity studio seeded with the design's content, and a repo with a PR waiting for review. Change the design, click **Rebuild**. Ready to launch, add the domain from the same screen.

This repo is the **starter template** (a TanStack Start site + a Sanity Studio) and the platform docs. The admin app and build agent are not built yet.

## Docs

| #   | Doc                                             | Covers                                                                                              |
| --- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| 01  | [Architecture](docs/01-architecture.md)         | The four subsystems, the app's own stack, where everything runs                                     |
| 02  | [Data model & jobs](docs/02-data-and-jobs.md)   | Projects, jobs, domains tables; the job system; how status reaches the dashboard                    |
| 03  | [Build agent](docs/03-build-agent.md)           | Figma → code. The design contract, the extractor, the headless Claude Code run, PR output, rebuilds |
| 04  | [Starter template](docs/04-starter-template.md) | The React + Sanity app every client repo is generated from                                          |
| 05  | [Provisioning](docs/05-provisioning.md)         | Sanity + GitHub + Cloudflare, as an idempotent job                                                  |
| 06  | [Previews & DNS](docs/06-previews-and-dns.md)   | Reading deployments back; custom domains with a pending state                                       |
| 07  | [Build plan](docs/07-build-plan.md)             | Phases, exit criteria, first tasks                                                                  |
| 08  | [Open questions](docs/08-open-questions.md)     | Decisions still needing Kenner, with the default each doc assumes                                   |

## Local development

```bash
cp .env.example .env && cp studio/.env.example studio/.env   # fill in the Sanity project id
pnpm install
pnpm dev          # site → http://localhost:3000
pnpm dev:studio   # studio → http://localhost:3333
```

Quality gates: `pnpm typecheck`, `pnpm lint`, `pnpm check`, `pnpm build`, `pnpm build:studio`.

## Status

2026-09-16 · starter scaffolded and deployed (site + studio on Workers). Extractor and screenshot scripts working. First local agent run produced PR #1 matching the Figma render. Not yet: `translate.yml`, the admin (desktop app + Worker API), provisioning, DNS.
