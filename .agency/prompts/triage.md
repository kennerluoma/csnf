You are triaging the open issues of this site, not fixing them. Read .agency/issues.json (every open issue with labels and comment threads), AGENTS.md, and skim src/routes and src/lib to know which area each issue touches.

Write ONE file, .agency/triage.json, and nothing else. Do not edit code. Shape:

{
"duplicates": [{ "of": <issue kept>, "issues": [<numbers that duplicate it>], "why": "" }],
"needsInfo": [{ "issue": <n>, "question": "what the reporter must add before anyone can act" }],
"labels": [{ "issue": <n>, "add": ["design-gap" | "bug" | "content" | "feature"] }],
"batches": [
{ "name": "short name", "area": "route or component", "issues": [<numbers>], "why": "why these go together", "order": 1 }
]
}

Rules

- Every open issue appears exactly once across `duplicates.issues`, `needsInfo`, or a batch. Duplicates and needs-info issues are not in batches.
- A batch is one fix session = one branch = one PR. Group by the code that changes (same route, same primitive, same content type), not by reporter or date. At most 6 issues per batch; split by area if larger.
- Order batches so that earlier ones do not depend on later ones (layout shell before things inside it; content model before things that read it).
- Add exactly one kind label per issue unless it already has one. `content` = only CMS documents change; `design-gap` = the design did not specify it and a decision is baked in; `bug` = something the site already claims to do is wrong; `feature` = new behaviour.
- `needsInfo` only when the issue is genuinely unactionable (no route, no expected outcome, no value). A vague-but-clear issue goes in a batch.
- Keep `why` to one sentence each.
