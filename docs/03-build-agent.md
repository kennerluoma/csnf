# 03 · Build agent (Figma → code)

The component with no off-the-shelf answer. Everything else is plumbing that gives it somewhere to run and land.

## Strategy

Don't convert arbitrary Figma. Define a **design contract**, deterministically extract a **manifest** from compliant files, and have **Claude Code, running headless in GitHub Actions**, map that manifest onto a **fixed target** (the starter's blocks, primitives, tokens, schema patterns). Verify visually, iterate, open a PR. Quality comes from constraining both ends.

**Best-effort and re-runnable.** Rebuild is a button. Each run = fresh branch = fresh PR = fresh preview. No pressure to be right first time; the human picks the PR they like.

## The design contract (one Figma page as a checklist)

1. One Figma page named `Site`. Its top-level frames are routes; frame name → path (`Home` → `/`, `Work / Detail` → `/work/[slug]`).
2. Direct children of a route frame are sections: auto-layout frames named `Section / <Type>` (`Section / Hero`, `Section / CardGrid`). `<Type>` becomes the block name.
3. Repeated items are component instances. Count > 1 → array field.
4. No token discipline required. The extractor collects every distinct colour, font family/size/weight, radius and spacing value it sees; the agent names them and writes `tokens.css` + the Tailwind theme. Use styles or variables if you like; they only give the agent better names.
5. Text layers named by role: `heading`, `eyebrow`, `body`, `cta/label`, `cta/href`.
6. Images are fills on frames named `image/<role>`; alt text in the layer description.
7. One frame per route at 1440; optional `<Route> @mobile` at 390.
8. `_ignore` or hidden = skipped.

`figma-lint` runs first; violations lower confidence and appear in the PR body, they don't block.

## The workflow: `translate.yml` in every client repo

```yaml
on:
  workflow_dispatch:
    inputs: { figmaFileKey: {required: true}, mode: {default: build} }   # build | rebuild
jobs:
  translate:
    runs-on: ubuntu-latest
    timeout-minutes: 90
    steps:
      - checkout
      - pnpm install
      - run: pnpm agency extract --file $FIGMA_FILE_KEY          # → design/manifest.json, renders/, assets/
      - run: pnpm agency lint                                    # → design/lint.json
      - run: git checkout -b design/$(date +%Y%m%d-%H%M)
      - run: npx @anthropic-ai/claude-code -p "$(cat .agency/prompts/translate.md)" \
               --allowedTools "Read,Write,Edit,Bash(pnpm *),Bash(git *)" --max-turns 200 \
               --output-format json > design/agent-report.json
        env: { ANTHROPIC_API_KEY, SANITY_WRITE_TOKEN, SANITY_PROJECT_ID }
      - run: pnpm build && pnpm test:visual                      # final gate; fails the run if build breaks
      - run: git add -A && git commit -m "design: translate from Figma $FIGMA_FILE_KEY" && git push -u origin HEAD
      - run: gh pr create --fill --body-file design/pr-body.md
```

`pnpm agency …` is the platform's CLI package installed as a dev dependency of the template. Exact flags for `claude -p` to be confirmed against current Claude Code docs at build time.

## Step 1 · Extract (deterministic, no LLM)

Figma REST: `GET /v1/files/:key` (tree), styles from the file response when present (variables endpoint skipped; it's Enterprise-only and we don't need it), `/v1/images/:key?ids=…&format=png&scale=2` (route renders + image assets), `/v1/files/:key/components`.

Output `design/manifest.json`:

```jsonc
{ "fileKey":"…","version":"…",
  "palette": {"colors":[{"hex":"#0D1020","uses":41,"styleName":"Ink"}], "fonts":[{"family":"Inter","size":48,"weight":600,"uses":6}], "radii":[…], "spacing":[…]},
  "routes":[{"id":"12:34","name":"Home","path":"/","render":"design/renders/home.png",
    "sections":[{"id":"12:40","type":"Hero",
      "text":{"heading":"…","body":"…","cta/label":"…"},
      "images":[{"role":"background","asset":"design/assets/12-41.png","alt":"…"}],
      "layout":{"direction":"row","gap":32,"padding":[96,0]},"children":[…]}]}],
  "components":[…], "lint":[{"level":"warn","node":"12:99","msg":"section frame not auto-layout"}] }
```

Everything downstream reads the manifest. The agent is testable against fixture manifests with no Figma access.

## Step 2 · Translate (Claude Code headless)

Context the agent sees: `AGENTS.md` (conventions + mapping rules), `.agency/prompts/translate.md` (the task), `design/manifest.json`, `design/renders/*.png`, the three example blocks in the repo. Tools: file edits, `pnpm build`, `pnpm test:visual`, git (branch only). Ordered tasks in the prompt:

1. **Tokens.** From `manifest.palette`, name the colours/type scale/spacing (semantic where obvious: `--color-ink`, `--color-surface`, `--text-display`) and write `src/styles/tokens.css` + the Tailwind theme. Nothing else until tokens exist.
2. **Block plan.** For each distinct section type: reuse existing block or create. Write the plan table to `design/pr-body.md` before generating.
3. **Per block**: `src/blocks/<Type>/{Type}.tsx`, `{Type}.schema.ts`, `{Type}.groq.ts`; register in `src/blocks/registry.ts`. Only `src/ui` primitives and tokens; no ad-hoc values.
4. **Pages**: one `page` document per route, `blocks[]` body.
5. **Seed content** into the `development` dataset via the Sanity client: page docs with block content from manifest text, uploaded image assets. This is why the preview looks like the design rather than lorem ipsum.
6. **Visual loop**: build, Playwright screenshot each route at 1440 (390 if mobile frame), pixelmatch vs `design/renders/`, look at both images, fix, repeat ≤ N per route. Record final diff % per route.
7. **PR body**: plan table, lint warnings, per-route diff %, side-by-side screenshots, "couldn't map" list.

Model: Opus-class. Budget per run is a config value (doc 08 Q6).

## Rebuild semantics

v1: every Rebuild starts from `main` and produces a complete fresh branch. Simple, predictable, and matches "hit it repeatedly". Human edits live on `main`; the agent sees them because it starts from `main` and is told to preserve code it doesn't understand.

Later (doc 07 phase 4): `design/mapping.json` (node id → files + Sanity doc ids) so a Rebuild touches only changed nodes and seed-content merges respect client edits in Sanity. Not v1.

## Outputs

Branch `design/<stamp>`, a PR, a Worker preview at `https://design-<stamp>-<slug>.<sub>.workers.dev` (`deploy.yml` uploads a version aliased to the branch on push), seed documents in Sanity `development`. The admin's build job records PR URL, branch, preview URL.
