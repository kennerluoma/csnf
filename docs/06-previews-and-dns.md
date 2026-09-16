# 06 · Previews & DNS

Fully scriptable, unlike the git integration. Two async surfaces.

## Deployments (Workers versions)

Site and studio are Workers, not Pages. Every `wrangler versions upload --preview-alias <branch>` creates a version with a preview URL `https://<alias>-<slug>.<sub>.workers.dev`; `wrangler deploy` on `main` creates a version and a deployment. Read them back with the Workers versions/deployments API (`GET /accounts/:id/workers/scripts/:name/versions`, `.../deployments`; verify exact paths and fields before implementing). Alias = branch name sanitised to `[a-z0-9-]`, ≤ 28 chars (see `deploy.yml`).

Dashboard **Deployments** tab reads the `deployments` cache; a **Refresh** button runs `refresh_deployments`. Build jobs also refresh once the Actions run concludes, so the PR's preview appears without a click. Each row links to its URL; the production row is highlighted.

## Custom domains (job type `add_domain`)

Policy: we strongly recommend clients put DNS on our Cloudflare account, and that's the only fully automated path. Bring-your-own DNS is supported as a manual path: the job adds the domain to the Pages project, then the UI shows the CNAME the client must create and polls for activation. Costs/setup for that path are a sales conversation, not a product feature.

| Step                | Call                                                                                                                               | Notes                                                                                             |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `zone.lookup`       | `GET /zones?name=<apex>`                                                                                                           | not found → switch to bring-your-own mode: skip `dns.upsert`, show CNAME instructions, still poll |
| `pages.domain.add`  | `POST /accounts/:id/pages/projects/:slug/domains` `{name: hostname}`                                                               | idempotent check: `GET …/domains` first                                                           |
| `dns.upsert`        | `GET /zones/:zid/dns_records?name=hostname`, then `POST` or `PUT` `{type:"CNAME", name, content:"<slug>.pages.dev", proxied:true}` | apex: same CNAME, Cloudflare flattens                                                             |
| `pages.domain.poll` | `GET …/domains/:hostname` until `status === "active"`                                                                              | `sleep 30s`, deadline 30 min → leave `pending`, UI shows it and offers Re-check                   |

Domain endpoints and field names are from memory; **verify against current Cloudflare docs before implementing** (Workers custom domains API, Workers routes, DNS records API).

Production cutover stays manual: merging to `main` deploys production, and the custom domain points at the Worker, so "go live" is merge + domain active. No separate publish button in v1. The studio gets `admin.<domain>` the same way.
