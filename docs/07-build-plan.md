# 07 · Build plan

Ordered by risk. Prove the build agent on one design before wrapping it in an app.

## Phase 0 · Prove translation by hand

- Author or pick one Figma file that follows the contract (doc 03).
- Build `agency-starter` by hand (doc 04). Deploy it to a manually created Pages project via `deploy.yml`.
- Write `extract` as a script; commit a manifest.
- Run Claude Code **locally** in the starter against the manifest, with `AGENTS.md` and the translate prompt. Iterate on the prompt, the contract and the primitives until you'd merge the output.
- **Exit:** a PR produced from the manifest with no hand edits that you would ship. Per-route visual diff under ~5%.

## Phase 1 · Run it in Actions

- Package extractor + lint + prompt as the `agency` CLI dev-dependency; add `translate.yml`.
- Mark `agency-starter` as a template. Dispatch `translate.yml` by hand on a second design.
- **Exit:** two designs → two PRs with previews, zero local steps.

## Phase 2 · The app: projects + provisioning + build button — MOSTLY DONE 2026-09-16
- Done: provisioner (Sanity, GitHub, secrets, first deploy), local build runner, Tauri app with projects, new project (Figma picker), project screen (links, domain, previews + merge, checklist, notes, build history), job records. Pending: Worker API + D1 for shared state (needs D1 permission on the CF token), webhook.

- Worker: Hono, D1 schema (doc 02), Workflows for `provision` and `build`, GitHub webhook, Access in front.
- Dashboard: Projects, New project, Project → Jobs tab, Job timeline.
- **Exit:** from the browser: create project → Provision → Build → preview link on screen. Provision twice on a fresh slug: one of everything.

## Phase 3 · Previews + DNS — DONE 2026-09-16 (Workers custom domains; studio at admin.<apex> or <sub>-admin.<apex>)

- Deployments cache + tab; `add_domain` job with pending state.
- **Exit:** a test domain on our zone goes pending → active from the dashboard; deployments list matches Cloudflare.

## Phase 4 · Rebuild quality — rules + mapping.json contract written 2026-09-16; untested

- `mapping.json`, manifest diff, touch-only-changed-nodes, seed-content merge rules.
- **Exit:** three design edits (copy, add section, remove section) → three PRs; hand edits on `main` survive.

## Phase 5 · Later

Figma plugin "Build this file" button, mobile frames, Slack notifications, own-container runner, auto-merge on high confidence, per-client token scoping, teardown checklist tooling.

## First tasks

1. Answer doc 08 (or accept the defaults).
2. Phase 0–1 run on personal GitHub / Sanity / Cloudflare accounts. Create the GitHub org and Sanity org before Phase 2; owner and org ids are config, so moving is a state-file edit.
3. Author the Phase 0 Figma file to the contract. Note everything that felt unnatural; that's contract feedback.
4. Scaffold `agency-starter`; cut the block system and three example blocks; get `deploy.yml` deploying.
5. Write `extract.ts`; commit the first manifest.
6. Run the agent loop once locally. Write down everything it got wrong.
