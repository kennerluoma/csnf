# 02 · Data model & jobs

## Tables (D1, Drizzle)

```sql
projects
  id            text pk            -- ulid
  slug          text unique        -- "gallery-client"; key for every vendor resource
  name          text
  figma_file_key text
  figma_url     text
  github_repo   text               -- "owner/gallery-client"
  sanity_project_id text
  cf_pages_project  text           -- usually = slug
  status        text               -- new | provisioning | provisioned | building | built | failed
  created_at, updated_at

jobs
  id            text pk
  project_id    text fk
  type          text               -- provision | build | add_domain | refresh_deployments
  status        text               -- queued | running | succeeded | failed
  steps         text (json)        -- [{name, status, startedAt, finishedAt, result?, error?}]
  external_url  text               -- Actions run URL for build jobs
  result        text (json)        -- {prUrl, previewUrl, branch} etc.
  error         text
  created_at, started_at, finished_at

domains
  id            text pk
  project_id    text fk
  hostname      text
  zone_id       text
  status        text               -- pending | active | error
  cf_domain_status text            -- raw status from Pages custom-domain API
  dns_record_id text
  created_at, updated_at

deployments   (cache of Cloudflare's list, refreshed by job or on page view)
  id, project_id, cf_deployment_id, environment, branch, url, stage, stage_status, created_on
```

Vendor tokens are **not** in the DB. Per-project Sanity write tokens are written straight into repo secrets during provisioning and never stored by the admin; if lost, mint another.

## Job system

Every dashboard action → `INSERT INTO jobs … status='queued'` → start a Cloudflare Workflow with the job id. The Workflow runs named steps; after each step it updates `jobs.steps`. The UI polls `GET /api/jobs/:id` every 2–3s while status is `running`.

Step semantics:

- **Idempotent by construction.** Each step checks before it creates (doc 05). A failed job can be re-run from the dashboard and it resumes at the first incomplete step.
- **Never destructive.** No step deletes remote state. Cleanup is a human with a checklist, later.
- **Long waits are `sleep`, not spin.** Polling a Pages deployment or an Actions run is `step.sleep('30s')` in a loop with a deadline.

## Job types

| Type                  | Steps                                                                                                                           | Ends when                                                   |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `provision`           | sanity.project → sanity.datasets → sanity.cors → sanity.token → github.repo → github.config → cf.pages.project → github.secrets | all steps done; project.status = provisioned                |
| `build`               | github.dispatch(translate.yml) → wait for run → read PR + preview URL                                                           | run concludes; result has prUrl/previewUrl/branch           |
| `add_domain`          | cf.pages.domain.add → cf.dns.record.upsert → poll domain status                                                                 | status active, or pending after deadline (UI shows pending) |
| `refresh_deployments` | cf.pages.deployments.list → upsert cache                                                                                        | immediate                                                   |

## API (Hono)

```
GET    /api/projects                 list
POST   /api/projects                 create record only (no side effects)
GET    /api/projects/:id             record + latest jobs + deployments + domains
POST   /api/projects/:id/provision   → job
POST   /api/projects/:id/build       → job   (body: {figmaFileKey?})
POST   /api/projects/:id/domains     → job   (body: {hostname})
GET    /api/jobs/:id                 status + steps
POST   /api/jobs/:id/retry           → new job resuming the same type
POST   /api/webhooks/github          workflow_run, pull_request → update build jobs
```

## Dashboard screens

1. **Projects** · table: name, status, last build, preview link, admin link, repo link.
2. **New project** · name, slug (auto), Figma URL. Creates the record; **Provision** is a separate button so a typo'd slug doesn't create three remote resources.
3. **Project** · header with the four vendor links; tabs: **Jobs** (live step list per job, external run URL), **Deployments** (from cache, refresh button, each row links to its `*.pages.dev` URL), **Domains** (add hostname, shows pending/active), **Settings** (Figma file, rename).
4. **Job** · step timeline with timings, error text, "open run in GitHub".
