# 05 · Provisioning (job type `provision`)

Check-then-create, keyed on slug, never deletes. Runs as a Cloudflare Workflow; each step is a checkpoint, so a retry resumes where it stopped.

| Step               | Service    | Call                                                                                                                                              | Check first                                                              |
| ------------------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `sanity.project`   | Sanity     | `POST https://api.sanity.io/v2021-06-07/projects` `{displayName: slug, organizationId?}`                                                          | `GET /projects`, match `displayName === slug`                            |
| `sanity.datasets`  | Sanity     | `GET /projects/:id/datasets`, then `PUT /projects/:id/datasets/production` `{aclMode:"public"}`                                                   | list first; PUT returns 409 on an existing dataset (verified 2026-09-16) |
| `sanity.cors`      | Sanity     | `POST /projects/:id/cors` `{origin, allowCredentials:true}` for `http://localhost:5173`, `https://<slug>.pages.dev`, `https://*.<slug>.pages.dev` | `GET /projects/:id/cors`                                                 |
| `sanity.token`     | Sanity     | `POST /projects/:id/tokens` `{label:"agency-<stamp>", roleName:"editor"}` → `key` (shown once)                                                    | if repo secret exists, skip; else mint                                   |
| `github.repo`      | GitHub     | `POST /repos/{owner}/agency-starter/generate` `{owner, name: slug, private: true}`                                                                | `GET /repos/:owner/:slug` → 404 = create                                 |
| `github.config`    | GitHub     | `PUT /repos/:o/:r/contents/agency.json`                                                                                                           | compare sha                                                              |
| `cf.pages.project` | Cloudflare | `POST /accounts/:id/pages/projects` `{name: slug, production_branch:"main"}` (no `source` → direct upload)                                        | `GET …/pages/projects/:slug` → 404 = create                              |
| `github.secrets`   | GitHub     | `GET …/actions/secrets/public-key` → libsodium sealed box → `PUT …/actions/secrets/:name`                                                         | PUT is upsert                                                            |

Sanity and GitHub calls above were verified against current docs on 2026-09-16. Dataset creation is **PUT** with the name in the path, and it is **not** idempotent (409 on repeat), so list first. GitHub wants header `X-GitHub-Api-Version: 2026-03-10`. Cloudflare token needs **Workers Scripts: Edit** (and DNS: Edit on zones for doc 06); verify the Workers script endpoints before implementing.

## Secrets written to each repo

Secrets: `SANITY_PROJECT_ID`, `SANITY_WRITE_TOKEN`, `FIGMA_TOKEN`, `ANTHROPIC_API_KEY`, `CF_API_TOKEN`, `CF_ACCOUNT_ID`. Variable: `SANITY_DATASET=production` (single dataset for now).

## Admin Worker secrets

`GITHUB_TOKEN` (fine-grained: repo, workflow, secrets, contents on the org), `GITHUB_OWNER`, `TEMPLATE_REPO`, `SANITY_AUTH_TOKEN`, `SANITY_ORG_ID?`, `CF_API_TOKEN` (Pages edit + DNS edit on the zones), `CF_ACCOUNT_ID`, `FIGMA_TOKEN`, `ANTHROPIC_API_KEY`.

## Definition of done

Provision the same fresh slug twice from the dashboard: one Sanity project, one repo, both jobs green, second job logs `reusing` on every step; first push to `main` creates both Workers.
