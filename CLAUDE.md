# Simulation Starter

Vue + Vite workspace in `frontend/`. See `README.md` for behavior and run instructions.

- Install: `npm run install:all`. Dev: `npm run dev` (Vite on :5173; Express on :8787 is optional in dev).
- Verify: `npm test && npm run build` (frontend and backend suites).
- Prod: `npm start` builds the frontend and serves it from one Express process with a strict CSP.
- Primary entry: `frontend/src/App.vue` at `/` has Google account sign-in, timeline, preflight, and no API-key onboarding. `frontend/src/ResearchWorkspace.vue` at `/researcher.html` preserves the existing research interface and optional browser-direct key workflow. Both default to demo; ChatGPT plan inference remains unavailable.

## Project map

- `frontend/src/lib/simulationWorkspace.js` and `frontend/src/composables/useSimulationWorkspace.js`: the controller (sessions, runs, persistence). Covered by `frontend/tests/`. Do not change these for UI work.
- `frontend/src/App.vue`: primary login, timeline, preflight, chat, and split view. `ResearchWorkspace.vue`: research shell, records, settings, semantic search, and ⌘K palette. Vite builds both HTML entries with isolated styles.
- `frontend/src/components/`: `SidebarPanel`, `ResearchGraph` (Vue Flow + d3-force knowledge graph), `SimulationGraph` (primary illustrative network), `AgentNode`, `fx/BootScreen`.
- Semantic search (in-browser vector DB): `frontend/src/lib/semanticIndex.js` (Orama hybrid BM25 + vector index, diffed sync, unit-tested with a fake embedder), `frontend/src/workers/embed.worker.js` (transformers.js `all-MiniLM-L6-v2`, q8, off the main thread), `frontend/src/composables/useSemanticSearch.js` (lazy start after first paint, embeddings cached in IndexedDB by text hash). It powers the sidebar filter and the ⌘K palette, and keyword matches always show instantly.
- Backend (`backend/`, Express 5): both static entries, SPA fallback, `GET /api/health`, shared account API handlers from `server/`, and security headers. Vercel `api/` and Vite development use those same account handlers. Preserve exact OAuth origins and server-only credentials.
- Research flow: `frontend/src/lib/llm.js` (OpenAI client: strict JSON-schema output enumerating the 11 stakeholder ids, `parseAnalysis` fails closed, retries with backoff on 429/5xx, a retry without sampling params for models that reject them, moderation, model listing), `frontend/src/lib/records.js` (research records: canonical JSON plus a SHA-256 fingerprint, `verifyRecord`, long-format CSV with formula-injection protection), `frontend/src/composables/useResearch.js` (settings, key handling, the IndexedDB record store, guarded check → analyze, export, delete-all), `components/AnalysisPanel.vue`, `components/SettingsDialog.vue`.
- Guardrails: `frontend/src/lib/guardrails.js`, the local screen (crisis, secrets, injection, PII, violence/unsafe, individual care, partisan framing) plus a keyword health-topic check for demo mode.
- `frontend/src/lib/agents.js`: the fixed agents and relations shared by the graph and the analysis.
- `frontend/src/components/ui/`: vendored shadcn-vue (Reka UI) and Inspira UI components. Restyle them through tokens; edit them only to fix bugs.
- `DESIGN.md`: the research workspace design system. Follow it for changes to `/researcher.html`; preserve the primary workspace’s separate white theme: lowercase chrome, mono labels, one coral accent, hairlines instead of shadows, muted `--kg-*` category colors, and motion that respects `prefers-reduced-motion`.

## Gotchas

- Use `animate` in motion-v, not `whileInView`. `whileInView` throws when an ancestor is `display: none` (for example, chat hidden in graph view) and breaks Vue's re-render.
- GSAP and `requestAnimationFrame` pause in background tabs. Anything that gates the UI (the boot screen) needs a timer fallback.
- Geist Mono lacks some glyphs (e.g. `⮡`). Draw rare symbols as inline SVG or a CSS mask.
- MiniLM cosine scores for short queries are low (real matches are around 0.2–0.3), so the semantic threshold is 0.2. Don't "fix" it back up.
- OpenAI mode stops the 24s demo playback as soon as the analysis returns, so follow-ups aren't blocked; the graph and sidebar follow the analysis status (`effectiveStatus`).
- The vendored `Command` has a cmdk-style `shouldFilter` prop and an `update:searchTerm` emit. The palette ranks results itself.
- The embedding model (~23 MB) comes from the Hugging Face CDN on first use and is then browser-cached. The onnx wasm (~27 MB) ships in `dist`. For a fully offline venue, warm the cache before judging.
- Vue Flow's `fit-view-on-init` runs before the pane settles. `ResearchGraph` re-fits on resize, so keep that.

## Skills (say the trigger phrase)

- "ship it": `ship-it`. Branch, commit, push and open a PR, authored by the user.
- "demo ready" / "prep the demo": `demo-ready`. Green build, rehearse the golden path in the browser, write `DEMO.md`, plan B.
- "write the devpost" / "submission": `devpost-writeup`. `SUBMISSION.md` built from real code and commits, honest about what's mocked.
- "what should we cut" / "N hours left": `scope-cut`. Impact versus effort triage and a timeboxed plan.
- "deploy" / "give me a link": `deploy-preview`. Static preview deploy after confirming the provider.

## Guardrails, privacy and data (non-negotiable)

- Scope is community-level healthcare and public-health scenarios only. Order of checks: `screenPrompt` (local) → demo: health-topic keywords / OpenAI: moderation on the input → the model's own `in_scope` check (schema enum) → moderation on the generated text (flagged text is redacted, scores kept).
- On `/researcher.html`, the OpenAI key lives in memory by default; opt-in "remember" uses sessionStorage only and requests go directly to OpenAI. Primary account API compatibility uses an encrypted HttpOnly cookie as documented in AUTH_SETUP.md. Never put plaintext credentials in localStorage, IndexedDB, logs, records, exports, or source control.
- Every run created in the research workspace gets a research record (demo runs too); primary workspace runs do not create those records. Records carry provenance (resolved model, temperature, seed, prompt version, system fingerprint, tokens, latency, guardrail results) and a SHA-256 fingerprint. Don't add fields without bumping `RECORD_SCHEMA_VERSION`.
- Caching: identical analyses (same prompt, model, params and prompt version) are served from existing records via `analysisKey`; there is no separate cache store. "re-run fresh" bypasses it. Deleting a chat deletes its records, and with them any cached output; semantic-search embeddings are pruned to live text.
- Label model output honestly: uncited, confidence self-reported, not medical advice.
- When adding guardrail patterns, add both a blocked case and a legitimate look-alike to `tests/guardrails.test.js`.
- RAG and knowledge distillation were considered. Distillation isn't worth it here. RAG ("bring your own sources", local chunking and embedding, cited `[S1]` passages) is the recommended next step for accuracy; ask before building it.

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
