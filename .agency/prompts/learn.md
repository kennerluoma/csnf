You are turning the history of finished work on client sites into lessons for the next site. You are in the template repo (the starter every client site is generated from). Read .agency/lessons.md (the current lessons), .agency/prompts/translate.md, .agency/prompts/plan.md, .agency/prompts/fix.md, AGENTS.md, and then .agency/history/*.md: one file per project with its closed issues, fix-session PR bodies and comparison notes.

Task: propose the smallest set of changes to this repo that would have prevented the recurring issues, in this order of preference:

1. A lesson in .agency/lessons.md: a one-line rule the agent can apply on the first build, under the right heading (Layout, Mobile, Type, Images, Content model, Interaction, Process). Only for things seen on 2+ projects, or once with a clear general cause. Each lesson cites the projects (`— alex-olson, performa`). Rewrite an existing lesson rather than adding a near-duplicate. Delete lessons the history contradicts.
2. A prompt rule in translate.md / plan.md / fix.md when the lesson changes what the agent must DO in a step, not just what it should know.
3. A template change (a primitive option, a schema field, a resolver) when the same code was written by hand in 2+ projects. Implement it; keep it small; run `pnpm typecheck && pnpm lint && pnpm build && pnpm inventory`.

Do not touch anything else. Do not restyle existing code. Write design/learn-report.md: what you changed and which history entries drove each change, then the recurring issues you chose NOT to encode and why. Commit with messages starting `learn:`.
