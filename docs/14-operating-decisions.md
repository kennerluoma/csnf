# 14 · Operating decisions (2026-09-17)

Decisions taken with the operator after the first two real designs. The agent files (AGENTS.md, prompts, lessons) follow from these; `agency learn` keeps them current, nobody edits them by hand.

## Template upgrades never happen underneath a live site

A client site is its own codebase the moment it is generated: unique components, its own header, carousel and date behaviour. The template is where new sites start, not a dependency that live sites track.

- Nothing updates a client repo automatically. No shared runtime package, no auto-merge.
- Bringing a site up to the current template is a deliberate **upgrade session**: a ticket, a fix session with `--refresh-prompt` (copies the template-owned files: prompts, scripts, `src/server.ts`, `src/lib/staticData.ts`), a preview URL, the budget check, a person merging.
- Dependabot PRs on client repos are the same: grouped weekly, 7-day cooldown, CI (lint, types, build, budget, audit) and a preview before a person merges. Security advisories arrive immediately but still as PRs.
- The platform should show, per project, how far behind the template it is (template commit at generation vs now), so upgrades are chosen, not discovered.

## Builds finish the site; they don't ask

The first build produces a complete, functional site and CMS: every content type (artworks, artists, exhibitions, events, articles, their categories) with styled index and detail routes and seeded documents, whether the design drew them or not. Ambiguities are decided, implemented and logged in the PR as `decision · why · where to change it`. Only what code cannot settle (a font licence, a legal fact) is a question.

The example designs were not made for this pipeline. If unstructured files deploy, structured ones should need only interaction and animation follow-ups.

## Visual check: a report, not a gate

Planned, not built. Screenshot each route at the design's frame width and compare with the Figma frame render.

- Normalised fidelity snaps values (9px → 8px or 10px), so exact pixel diffs would be noise. Compare structure instead: per-region position and size within a tolerance (a few px or ~2%), colour within a small ΔE, text present and in order; pixel diff only as a heat-map image for a person to glance at.
- "Pixel perfect" fidelity (agency.json) tightens the tolerances; normalised loosens them.
- The result is attached to the PR (side-by-side + heat map + a list of regions out of tolerance). It never fails CI on its own.

## Costs

The dollar figures on runs are the Claude CLI's API-price estimate of tokens used. The local runner uses the operator's Claude subscription login, so nothing is billed per run; the figure is a usage gauge, and the monthly budget is a usage cap. Only the optional GitHub Actions runner (`translate.yml`, `ANTHROPIC_API_KEY`) is pay-per-use; it stays off unless someone sets that secret.

## Demo projects

alex-olson and performa-2025 are demonstrations. They are not maintained and can be deleted after they have been shown. Do not spend sessions keeping them current.
