# 01 · Architecture

## Shape

An admin web app with a database, a job system, and a dashboard. Every button creates a **job**. Jobs take minutes, so nothing is request/response; the UI polls job status. Jobs do their work by calling vendor APIs or by dispatching GitHub Actions runs in client repos.

```
┌────────────────────────── Admin (Cloudflare Worker) ──────────────────────────┐
│  React dashboard (static assets)   Hono API   Workflows (jobs)   D1 (state)  │
└──────────┬──────────────────────────┬──────────────────────┬──────────────────┘
           │ provisioning             │ dispatch / webhooks  │ read deployments, DNS
           ▼                          ▼                      ▼
   Sanity Mgmt API            GitHub (repo from template,    Cloudflare API
   GitHub REST                 Actions: build agent,          (Pages, zones)
   Cloudflare API              deploy)
                                      │
                                      ▼
                          Client repo  ──push──▶  Cloudflare Pages preview
```

## Four subsystems

### 1. Projects (own data)

The client project record: slug, Figma file key, GitHub repo, Sanity project id, Cloudflare Pages project name, custom domains, status, job history. Exists in no vendor API; we own it. This is what the dashboard lists. Doc 02.

### 2. Provisioning (job)

Creates Sanity project + datasets + token, repo from the starter template, Cloudflare Pages project (direct upload, no git integration), repo secrets. Check-then-create on the slug; never deletes. Doc 05.

### 3. Build agent (job → GitHub Actions run)

A workflow in the client repo checks out the template code, extracts the Figma file into a manifest, runs **Claude Code headless** against the manifest and the repo's conventions, commits to a fresh branch, opens a PR. The push deploys a Pages preview. Best-effort and re-runnable: **Rebuild** is a button you can hit repeatedly, each run makes a new branch. Doc 03.

### 4. Previews & DNS

Read Pages deployments per project for the dashboard; add custom domains to a Pages project and manage zone DNS records, with an async _pending_ state until Cloudflare reports active. Doc 06.

## The admin's own stack (best guess; doc 08 Q1)

Cloudflare-native, one Worker, one deploy:

| Layer   | Choice                                                             | Why                                                                                                                                                                              |
| ------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API     | **Hono** on Cloudflare Workers                                     | tiny, typed, runs where everything else lives                                                                                                                                    |
| UI      | **React + Vite + TanStack Router**, served as Worker static assets | plain SPA; the dashboard is CRUD plus polling                                                                                                                                    |
| DB      | **D1** via Drizzle                                                 | SQLite is plenty for hundreds of projects and thousands of jobs; zero ops                                                                                                        |
| Jobs    | **Cloudflare Workflows**                                           | durable multi-step execution with retries and `sleep` for polling. Exactly the provisioning shape. Each step's result is checkpointed, which gives us idempotent resume for free |
| Auth    | **Cloudflare Access** in front of the Worker                       | zero auth code; allowlist of agency emails                                                                                                                                       |
| Secrets | Worker secrets (vendor tokens); D1 for per-project ids only        | tokens never in the DB                                                                                                                                                           |

Alternative if you'd rather not bet on Workflows: a `jobs` table plus a Queue consumer that runs steps and writes status. Same data model.

## Where the build agent runs (doc 08 Q2, revised 2026-09-16)

Two runners, same job row, `jobs.runner = local | actions`:

- **Local (desktop app).** A Tauri 2 shell around the same React admin UI spawns `claude -p` on the operator's Mac using **their own** Claude Code login (each of the 2–3 operators uses a personal subscription; nobody shares keys), with the repo cloned locally, the dev server running, and Playwright screenshots on local hardware. Cheapest and fastest, and secrets stay in the Keychain. Ties a job to one laptop being awake.
- **GitHub Actions.** Unattended and team runs. Needs `ANTHROPIC_API_KEY` in repo secrets; pays per token. The repo is already checked out, logs and a run URL are free, and the push triggers the deploy.

The agent program (`.agency/prompts/translate.md` + `AGENTS.md` + the `agency` scripts) is identical on both. First real run (local, Opus, 2026-09-16): 81 turns, 6 min, $3.66 token-equivalent, output matched the render.

## How the app learns a run finished

Primary: GitHub webhook `workflow_run` (and `pull_request`) → Hono endpoint → update job. Fallback: the Workflow polls `GET .../actions/runs/:id` every 30s. Both paths land on the same job row.

## Trust boundaries

- The admin Worker holds account-wide tokens (GitHub, Sanity, Cloudflare, Figma, Anthropic). Only agency staff reach it (Access).
- Each client repo holds only what its own runs need: its Sanity write token, `FIGMA_TOKEN`, `ANTHROPIC_API_KEY`, `CF_API_TOKEN` (Pages edit) and `CF_ACCOUNT_ID`.
- The build agent only ever pushes branches and opens PRs. Merge to `main` is a human.
