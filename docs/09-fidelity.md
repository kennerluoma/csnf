# 09 · Fidelity: how the design gets in, and the "normalised" mode

## How translation works today

1. `pnpm extract` (or the Figma plugin) writes `design/manifest.json`: every route frame, its sections in order, each section's named text/image layers, auto-layout numbers (gap, padding), fills, a compact layer tree, and a **palette**: every distinct colour, font (family/size/weight), radius and spacing value with a usage count.
2. Claude Code runs headless with three inputs: `AGENTS.md` (the repo's rules), `.agency/prompts/translate.md` (the task, in six ordered steps), and the manifest plus renders.
3. The prompt already biases toward reuse: "prefer fewer, more general blocks", "if a section is a near-duplicate of an existing block, reuse it and add an optional field rather than forking", "compose only `src/ui` primitives", "no raw hex". Tokens are written first, then blocks, then content, then a screenshot comparison loop.

So the prompt is the tuning surface, and there is no fine-tuning of a model. Improving output means improving (a) what the extractor hands over and (b) the rules in the prompt. Both are plain files in the template, versioned with it.

## The problem

Designers don't work in exact values. One heading is 47px, another 48; letter-spacing is -0.01em here and -0.015em there; gaps are 22, 24, 25. Taken literally, that produces a token per value and a one-off block per section. The screenshot loop then "fixes" toward the render and cements the noise.

## Fidelity modes

A per-project setting, `fidelity: normalised | exact`, default **normalised**. Stored in `agency.json`, chosen in the New project form (and changeable on the Project screen), passed as `--fidelity` to the build, and read by both the extractor and the prompt.

### `normalised` (default)

**Extractor**: snaps values before the agent sees them, and records what it snapped.

- Spacing and sizes → nearest of a 4px scale (4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96, 128). Anything within 15% of a scale step snaps; larger gaps are kept and flagged.
- Font sizes → a type scale derived from the palette: cluster sizes that are within 10% of each other, keep the most-used value per cluster (47/48/50 → 48). Weights snap to 400/500/600/700.
- Letter-spacing → three buckets: tight (≤ -0.01em), normal, wide (≥ 0.04em). Line-height → 1.0/1.1/1.25/1.4/1.6.
- Colours → merge anything within ΔE 3 (near-identical greys, off-whites) into the most-used member; keep the rest.
- Radii → 0/4/8/12/16/999.
- The manifest gets `normalisation: { rules, snapped: [{node, prop, from, to}] }` so the PR body can list what was rounded.

**Prompt**:

- "Treat two sections as the same block when they differ only in values the normaliser snapped, in text, or in the count of repeated children. Add a variant prop only when the difference is structural (different children, different layout direction)."
- "The visual loop compares against the render, but a difference that is within the normaliser's tolerance is not a defect. Do not add overrides to chase it."
- "Write at most N type styles (default 6) and one spacing scale. Everything must be expressed with them."

### `exact`

Extractor snaps nothing. Prompt drops the reuse thresholds and allows per-block token overrides. Use it for design-led clients who sign off on pixel accuracy. Expect more blocks and more tokens.

### Where the line is drawn (both modes)

Text content is never normalised. Colours that the designer uses deliberately (accent, backgrounds) are kept; only near-duplicates merge. The renders stay untouched so the reviewer still sees the designer's intent.

## Measuring whether it helps

Per run the PR body already reports per-route visual diff. Add two numbers: block count and token count. A healthy normalised run on a typical 5-page site should land around 8–12 blocks and under 40 tokens. Track them in the build record so regressions in prompt edits show up.

## Prompt hygiene

- Keep `translate.md` under ~120 lines. Every rule should have caused a bad output at least once.
- Version it with the template; note each change in the template's changelog with the run it came from.
- Client repos pull prompt updates through `agency build --refresh-prompt` (copies `.agency/` and `AGENTS.md` from the template before the run). Not yet implemented; see doc 11.
