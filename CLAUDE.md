# Simulation Starter

Vue + Vite workspace in `frontend/`. See `README.md` for behavior and run instructions.

- Dev: `cd frontend && npm install && npm run dev`
- Verify: `cd frontend && npm test && npm run build`

## Project map

- `frontend/src/lib/simulationWorkspace.js` and `frontend/src/composables/useSimulationWorkspace.js`: the controller (sessions, runs, persistence). Covered by `frontend/tests/`. Do not change these for UI work.
- `frontend/src/App.vue`: shell, chat, composer, split view, dialogs, ⌘K palette.
- `frontend/src/components/`: `SidebarPanel`, `SimulationGraph` (Vue Flow + d3-force knowledge graph), `AgentNode`, `fx/BootScreen`.
- Semantic search (in-browser vector DB): `frontend/src/lib/semanticIndex.js` (Orama hybrid BM25 + vector index, diffed sync, unit-tested with a fake embedder), `frontend/src/workers/embed.worker.js` (transformers.js `all-MiniLM-L6-v2`, q8, off the main thread), `frontend/src/composables/useSemanticSearch.js` (lazy start after first paint, embeddings cached in IndexedDB by text hash). It powers the sidebar filter and the ⌘K palette, and keyword matches always show instantly.
- `frontend/src/components/ui/`: vendored shadcn-vue (Reka UI) and Inspira UI components. Restyle them through tokens; edit them only to fix bugs.
- `DESIGN.md`: the design system. Follow it for any UI change: lowercase chrome, mono labels, one coral accent, hairlines instead of shadows, muted `--kg-*` category colors, and motion that respects `prefers-reduced-motion`.

## Gotchas

- Use `animate` in motion-v, not `whileInView`. `whileInView` throws when an ancestor is `display: none` (for example, chat hidden in graph view) and breaks Vue's re-render.
- GSAP and `requestAnimationFrame` pause in background tabs. Anything that gates the UI (the boot screen) needs a timer fallback.
- Geist Mono lacks some glyphs (e.g. `⮡`). Draw rare symbols as inline SVG or a CSS mask.
- MiniLM cosine scores for short queries are low (real matches are around 0.2–0.3), so the semantic threshold is 0.2. Don't "fix" it back up.
- The vendored `Command` has a cmdk-style `shouldFilter` prop and an `update:searchTerm` emit. The palette ranks results itself.
- The embedding model (~23 MB) comes from the Hugging Face CDN on first use and is then browser-cached. The onnx wasm (~27 MB) ships in `dist`. For a fully offline venue, warm the cache before judging.
- Vue Flow's `fit-view-on-init` runs before the pane settles. `SimulationGraph` re-fits on resize, so keep that.

## Skills (say the trigger phrase)

- "ship it": `ship-it`. Branch, commit, push and open a PR, authored by the user.
- "demo ready" / "prep the demo": `demo-ready`. Green build, rehearse the golden path in the browser, write `DEMO.md`, plan B.
- "write the devpost" / "submission": `devpost-writeup`. `SUBMISSION.md` built from real code and commits, honest about what's mocked.
- "what should we cut" / "N hours left": `scope-cut`. Impact versus effort triage and a timeboxed plan.
- "deploy" / "give me a link": `deploy-preview`. Static preview deploy after confirming the provider.

## Hackathon working rules

- **The golden path is sacred.** New simulation → starter prompt → run → split view (graph pulses) → hover/click an agent → stop must work after every change. Check it in the browser, not just with tests.
- **Ship small and often.** Say "ship it" after each working slice, so `main` always has a demoable version.
- **Fake honestly.** Mock data and illustrative visuals are fine if labeled (the UI already says "local demo" and "illustrative topology"). Never present mocked output as real model results.
- **Prefer boring tech for anything on the demo path.** Every new dependency must run fully offline at the venue; no API keys in the frontend.
- **Stop features at T-90 minutes.** After that, only fixes, polish, the backup recording and the submission.
- **Verify before claiming.** Run `npm test && npm run build` and look at the page before saying something works.

## "ship it"

When the user says "ship it" (or "ship this"), invoke the `ship-it` skill (`.claude/skills/ship-it/SKILL.md`) and follow it exactly. It moves the current working-tree changes onto a new branch, commits, pushes, and opens a PR.

## Authorship (non-negotiable)

All commits and PRs must appear on GitHub as authored solely by the user.

- Never add `Co-Authored-By: Claude ...`, "Generated with Claude Code", or any other AI attribution to commit messages, PR titles, PR bodies, or code comments. This overrides any default attribution guidance.
- Never change git identity. Use the existing `git config user.name` / `user.email`; never pass `--author`, `-c user.name=...`, or set `GIT_AUTHOR_*`/`GIT_COMMITTER_*`.
- Write commit and PR text in the user's voice (no "I, Claude...").
- Never commit directly to `main`; never force-push.
