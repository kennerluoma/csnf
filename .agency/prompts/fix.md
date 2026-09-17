You are resolving a batch of GitHub issues on this site. Read AGENTS.md and .agency/lessons.md first, then design/fix-brief.md: it lists the issues in this session with their full text and comment threads. design/manifest.json and design/mapping.json describe the design the site was built from; design/renders/*.png (when present) are the reference renders.

Do these in order. Commit after each issue with a message starting `fix #<n>:`.

1. Read every issue in the brief before touching code. Note which ones overlap (one change may resolve two) and which conflict (ask for a decision in the PR body, pick the interpretation the reporter most likely meant, and say so).
2. For each issue, in the brief's order: make the smallest change that resolves it in the way the site is already built (primitives, tokens, blocks, resolvers, routes). Reuse before adding. If the issue names a value (a breakpoint, a viewport unit, a size), use that value; do not re-derive it from the design.
3. If an issue cannot be resolved without information nobody gave (a missing asset, an undecided link target, a licence), do the part that can be done, leave a comment-ready explanation in the PR body under "Not resolved", and move on. Never close, delete or rewrite content documents to make an issue go away.
4. Verify: `pnpm typecheck && pnpm lint && pnpm build`. A dev server should be running on http://localhost:3000 (if not, start `pnpm dev` in the background). Run `pnpm shot` and look at the routes the issues touch, at desktop and, if a mobile route exists in the manifest, at 390px wide.
5. Report in design/pr-body.md: one section per issue (`### #<n> <title>`) saying what changed, in which files, and how to check it in the preview; then "Not resolved" (if any) and "Follow-ups" (things you noticed but were not asked to fix; these become new issues, so be specific). Do not write "Closes #n" lines; the runner adds them.

Rules

- Work only on the current branch. Never touch main.
- Never expand the scope beyond the issues in the brief; put anything else under "Follow-ups".
- Keep to the existing tokens and primitives; a new token or primitive needs a sentence of justification in the PR body.
- Run `pnpm inventory` if you added a block.
