# 06 · Admin: desktop app first

Decided 2026-09-16. Two or three operators, each on their own Claude Code login. The admin ships as a **Tauri 2 desktop app**; the same React UI is later served from the Worker as a web admin for read-mostly use.

## Why desktop

- **Local runner.** The app spawns `claude -p` on the operator's Mac with their own subscription. No shared API key, no per-token bill, faster iteration, Playwright on local hardware.
- **Local dev loop.** Clone the client repo, run `pnpm dev` and `pnpm dev:studio`, open the editor, open Figma. A website can't touch the filesystem.
- **Secrets stay local.** Figma token, Cloudflare token, GitHub token in the macOS Keychain via Tauri's stronghold/keyring plugin, never in a database.

## What stays in the cloud

The Worker API + D1 from doc 02 remains the system of record: projects, jobs, domains, deployments. It receives the GitHub webhook (needs a public URL) and runs cloud jobs (provisioning via Workflows, Actions dispatch). The desktop app is a client of that API plus a local executor.

## Repo layout

```
csnf/                        # this repo stays the starter template
agency-platform/             # new repo
├── packages/core/           # provisioner steps, Figma extractor, job/step types, API client  (TS, runs in Node and Workers)
├── apps/api/                # Hono on Workers + D1 + Workflows (doc 02)
├── apps/ui/                 # React + TanStack Router; screens from doc 02. Built once.
└── apps/desktop/            # Tauri 2 shell around apps/ui + local commands
```

## Desktop-only capabilities (Tauri commands)

| Command               | Does                                                                                                                                                                                                                                               |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `clone(project)`      | `git clone` into `~/agency/<slug>`; records the path locally                                                                                                                                                                                       |
| `runLocal(job)`       | runs the job's steps as child processes: `pnpm install`, `pnpm extract`, `git checkout -b design/<stamp>`, `claude -p … --model opus`, `pnpm shot`, `git push`, `gh pr create`; streams stdout to the job's step log; posts step status to the API |
| `dev(project)`        | starts `pnpm dev` / `pnpm dev:studio`, shows the ports, opens the browser                                                                                                                                                                          |
| `open(project, what)` | editor, Figma, repo, preview, studio                                                                                                                                                                                                               |
| `secrets`             | read/write Keychain entries; nothing leaves the machine except in request headers                                                                                                                                                                  |

Everything else (list projects, create project, provision, add domain, view deployments) is a plain API call and identical in the web build.

## Job model addition

`jobs.runner = 'local' | 'actions'`, `jobs.runner_host` (machine name for local). The step timeline in the UI is the same for both. A local job that loses its host mid-run is marked `stale` after 30 min with no heartbeat; a new job can be started.

## Auth

- API: Cloudflare Access service tokens per operator, stored in Keychain; the web build uses Access's browser login.
- Claude: each operator's own `claude` login on their machine. The app checks `claude auth status` before a local run and shows the fix if it's logged out (this bit us on day one).
- GitHub: each operator's `gh auth` for local pushes; the API holds one org-level token for provisioning.

## Build order (replaces the Phase 2 bullet list)

1. `packages/core`: move `scripts/extract.ts` and the job/step types in; keep the starter's `pnpm extract` as a thin wrapper.
2. `apps/api`: Hono + D1 schema + `projects` and `jobs` endpoints; GitHub webhook. Deploy.
3. `apps/ui`: Projects, Project → Jobs, Job timeline. Point at the API.
4. `apps/desktop`: Tauri shell, Keychain, `clone`, `runLocal` for the `build` job. This reproduces what was done by hand today, from a button.
5. Provisioning as a cloud job; `add_domain`; deployments tab (docs 05, 06 previews).
6. Web build of `apps/ui` served from the Worker behind Access.

## Not doing

Auto-update, code signing for distribution (ad-hoc signed builds for 2–3 known Macs), Windows/Linux.
