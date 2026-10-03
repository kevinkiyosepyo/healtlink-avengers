---
name: de-slop
description: Use before finishing any code change, UI copy, doc, commit or PR text in this repo, and whenever the user says "de-slop", "clean this up" or "this feels AI-generated". Audits the diff against code and writing anti-patterns, fixes what it finds, and records recurring corrections in the de-slop log.
---

# De-slop

Run this on the current diff (`git diff` plus untracked files) before declaring work done. Fix findings; don't just list them.

## Code anti-patterns

1. **Near-duplicate implementations.** Before adding a helper, component or CSS block, search the repo (`grep -rn`) for an existing one. Shared homes: `frontend/src/lib/` (pure logic), `frontend/src/lib/storage.js` (localStorage), `frontend/src/lib/download.js` (file export), `frontend/src/lib/records.js` (fingerprints, CSV), `frontend/src/lib/agents.js` (stakeholders, stance scale and color), `frontend/src/style.css` (shared `.tool-*`, `.btn-*`, `.field` styles), and `StatusBadge` for every status.
2. **Primitive obsession.** Model domain concepts once (agents, stance levels, plans, assessments, findings) and pass those objects around; don't scatter magic strings or numbers. Keep domain constants next to their data, not inline in components.
3. **Excessive abstraction.** No factories, wrappers or generic interfaces until there are at least two real callers. Three similar lines beat a premature helper; a third copy is the signal to extract.
4. **Enum tangles and nullable hell.** Don't grow one component that switches on a mode enum and makes half its props optional. Split by responsibility (e.g. `AnalysisPanel` vs. the demo strip). Validate at boundaries (`parseAnalysis`, `analyzePacket`, `buildStudy`) so the inside of the app can trust its data, instead of defensive `?.` and try/catch everywhere.
5. **Mirrored or green tests.** Test behavior and invariants (a delay on a slack task doesn't move the finish; malformed model output fails closed; deleting a chat removes its cached output), not implementation details. Every new guardrail pattern needs a blocked case and a legitimate look-alike.
6. **Redundant comments.** Delete comments that restate the code. Keep ones that explain *why*: a constraint, a browser quirk, a privacy rule, a non-obvious invariant.
7. **Inconsistent conventions.** Match the file you're in: naming, quote style, error handling (typed codes plus a user-facing copy table), lowercase UI copy, mono labels. Don't invent a new pattern next to an existing one.

## Writing anti-patterns (UI copy, docs, commits, PRs, chat replies)

- No filler or hype: "seamless", "robust", "powerful", "leverage", "delve", "cutting-edge", "game-changer", "unlock", "elevate".
- No claims without evidence: no invented metrics, testimonials, logos or "trusted by". Label mocked, illustrative or model-estimated output as such.
- Say the specific thing: "flags protocol ↔ consent visit-count conflicts" beats "streamlines document workflows".
- One idea per sentence; cut throat-clearing ("It's worth noting that…", "In today's fast-paced…").
- Follow `DESIGN.md` voice: lowercase chrome, mono metadata, em-dash separators in metadata (intentional here, not slop), no exclamation marks, no emoji.
- Commits and PRs: say what changed and why, in the user's voice, with no AI attribution.

## Procedure

1. List the files in the diff. For each, check the code anti-patterns above, especially duplicates: grep for function names and CSS selectors you added.
2. Read all new user-facing strings aloud against the writing rules.
3. Fix, then run `npm test && npm run build`.
4. If a correction is something you'd likely repeat, add one line to `.claude/skills/de-slop/LOG.md` (date, pattern, fix). Read the log first next time; it's how this skill personalizes to this repo.
