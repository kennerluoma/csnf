# 11 · Improving the system: a list, roughly ordered

Grouped by what they improve. Each line is a self-contained task. ✅ = done (2026-09-17).

## Translation quality

1. ✅ **Fidelity modes** (doc 09): normaliser in the extractor + prompt rules + per-project setting. Biggest lever on reuse.
2. ✅ **Block inventory in `AGENTS.md`**: one line per block with its fields and when to use it, generated from `schemas.ts` at build time so the agent never guesses.
3. **Design contract lint as a Figma plugin panel**: show violations inside Figma while designing, not in a PR body afterwards.
4. ✅ **Two-pass agent** (`.agency/prompts/plan.md`, Sonnet by default; `--single-pass` to skip): a cheap planning pass (Sonnet) writes the block plan; the expensive pass (Opus) only implements. Cuts cost on rebuilds where the plan is mostly "unchanged".
5. **Responsive frames**: honour `@mobile` frames when present; otherwise derive a stacking rule per block type and say so in the PR.
6. ✅ **Golden fixtures** (`agency fixture run|accept|list`; metrics in `fixtures/<name>/golden.json`): keep `fixtures/` as regression tests. After any prompt change, run the two fixtures and compare block count, token count and visual diff to the last accepted run.

## Content and template

7. ✅ **Template v2** (doc 10).
8. **Real images**: extractor exports image fills at 2×; agent uploads to Sanity with alt from the layer description. Works today for fixtures; verify on a real file once the quota allows.
9. ✅ **SEO defaults**: title template, description, OG image per page; sitemap and robots from the Worker.

## Operations

10. ✅ **Prompt refresh for existing repos** (`agency refresh <slug>` / `agency build --refresh-prompt`): `agency build --refresh-prompt` copies `.agency/` and `AGENTS.md` from the template before the run, so prompt improvements reach old projects.
11. ✅ **Second operator** (`platform/docs/operators.md`; `agency doctor` names the operator via the API's `/me`): token on the API, env on their Mac, and a `doctor` check that names them.
12. ✅ **Preview cleanup** (`agency previews prune`, also after `agency merge`; Cloudflare has no alias-delete API, so the alias lingers until the version ages out): delete Worker version aliases for merged/closed PRs (a scheduled job on the API, or a step after merge).
13. ✅ **Cost and time budget** (`agency budget <slug> <usd>`, `AGENCY_DEFAULT_BUDGET_USD`; `--force` overrides): per-project cap; the build refuses to start when the month's spend passes it.
14. ✅ **Actions runner parity** (`translate.yml`; `agency build --runner actions`): `translate.yml` in the template using `ANTHROPIC_API_KEY`, so unattended rebuilds work when no laptop is open.
15. **Client handover kit**: `agency invite` tested, plus a generated one-page "how to edit your site" doc per project linking their studio.

## Product surface

16. **Figma plugin, phase 2**: post the bundle to the desktop app over localhost instead of downloading a file; a "Build" button inside Figma.
17. **Notifications**: Slack or email when a build finishes or a preview's CI fails.
18. **Client-facing preview page**: password-protected preview with a comment box that files GitHub issues.

## Later, deliberately

Shopify (Storefront API blocks + checkout redirect), multi-language, members areas, custom container runner.
