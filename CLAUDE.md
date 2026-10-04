# Simulation Starter

Vue + Vite workspace in `frontend/`. See `README.md` for behavior and run instructions.

- Install: `npm run install:all`. Dev: `npm run dev` (Vite on :5173; Express on :8787 is optional in dev).
- Verify: `npm test && npm run build` (frontend and backend suites).
- Prod: `npm start` builds the frontend and serves it from one Express process with a strict CSP.
- Modes: **demo** (the 12 illustrative agents, no model) or **bring-your-own OpenAI key**, entered in "model & data". The key goes browser → api.openai.com directly. There is no server-side key, proxy or database.

## Product and positioning

microfish is a **clinical-trial rehearsal workspace** (hackathon Track 2: AI for clinical research). It rehearses a protocol before it's locked:
- **stakeholder rehearsal**, where a protocol change is scored against 11 trial stakeholder groups (demo agents or the researcher's own OpenAI key);
- **study build**, which turns the protocol into a schedule of activities, a draft CRF, edit checks, burden figures, and auto-queries from a source note;
- **document preflight**, which runs protocol/consent/onboarding consistency checks with line-level sources;
- **start-up timeline**, a critical path from final protocol to first participant in.

AI-native EDC/CRO platforms (e.g. Harbor, YC S26) automate execution after the protocol is locked: building the EDC from the protocol, extracting from source documents, generating queries. microfish sits upstream and complements them. Never imitate or name another company in the product UI; positioning belongs in the pitch.

## Project map

- `frontend/src/lib/simulationWorkspace.js` and `frontend/src/composables/useSimulationWorkspace.js`: the controller (sessions, runs, persistence). Covered by `frontend/tests/`. Do not change these for UI work.
- `frontend/src/App.vue`: shell, chat, composer, split view, dialogs, ⌘K palette.
- `frontend/src/components/`: `SidebarPanel`, `SimulationGraph` (Vue Flow + d3-force knowledge graph), `AgentNode`, `fx/BootScreen`.
- Semantic search (in-browser vector DB): `frontend/src/lib/semanticIndex.js` (Orama hybrid BM25 + vector index, diffed sync, unit-tested with a fake embedder), `frontend/src/workers/embed.worker.js` (transformers.js `all-MiniLM-L6-v2`, q8, off the main thread), `frontend/src/composables/useSemanticSearch.js` (lazy start after first paint, embeddings cached in IndexedDB by text hash). It powers the sidebar filter and the ⌘K palette, and keyword matches always show instantly.
- Evidence deliberation (`frontend/src/lib/evidence/`): `sources.js` covers OpenAlex, Europe PMC (including PubMed) and ClinicalTrials.gov. All are CORS-enabled and keyless, called from the browser; Google Scholar has no API and Semantic Scholar blocks CORS. Results are normalized to one Source shape, deduped, and retracted papers removed, with staggered requests and one retry on 429. `credibility.js` has rule-based credibility with a stated reason per point, query-term relevance, and web-domain tiers. `web.js` is the secondary OpenAI `web_search` (Responses API) path, credibility-filtered with excluded links kept. `deliberation.js` runs plan → retrieve → web → 5 agents' openings → rebuttals → moderator consensus, plus a deterministic `computeConsensus` cross-check and `checkCitations` (invalid ids dropped, uncited claims flagged). Results are stored as `record.deliberation` (record schema v2) and shown in `EvidencePanel.vue` (consensus / debate / provenance tabs).
- Cloud: `server/sync.js` (`/api/sync`: opt-in backup of records plus the workspace snapshot; keys are a salted hash of the account id; record fingerprints are verified server-side; DynamoDB in prod, in-memory with `SYNC_MEMORY=1`), and `frontend/src/composables/useCloudSync.js` (pushes changed items only, restore with confirmation, delete cloud copy). The `Dockerfile` builds the single production container; `infra/aws/` holds the App Runner + DynamoDB + Secrets Manager template, `deploy.sh` and a README.
- Auth (from Kevin's integration): `server/` (Auth.js Google sign-in, sessions, security), mounted by Express in `backend/src/app.js` and by Vite dev middleware in `frontend/vite.config.js`; `api/` holds the same handlers as Vercel functions for the current live site (`vercel.json`). The client side is `frontend/src/composables/useResearcherAccount.js`, surfaced in "model & data" and the sidebar footer. Setup and env vars are in `AUTH_SETUP.md`. The ChatGPT-sign-in and server-side OpenAI routes (`/api/openai`, `/api/simulate`) stay dormant until a team decision is made; the UI uses the browser-only bring-your-own key. Keep Vercel until the AWS deploy is live.
- Backend (`backend/`, Express 5): static hosting, SPA fallback, `GET /api/health`, and security headers (CSP `connect-src` limited to self, api.openai.com and the Hugging Face model CDN). Deliberately no data or model API.
- Research flow: `frontend/src/lib/llm.js` (OpenAI client: strict JSON-schema output enumerating the 11 stakeholder ids, `parseAnalysis` fails closed, retries with backoff on 429/5xx, a retry without sampling params for models that reject them, moderation, model listing), `frontend/src/lib/records.js` (research records: canonical JSON plus a SHA-256 fingerprint, `verifyRecord`, long-format CSV with formula-injection protection), `frontend/src/composables/useResearch.js` (settings, key handling, the IndexedDB record store, guarded check → analyze, export, delete-all), `components/AnalysisPanel.vue`, `components/SettingsDialog.vue`.
- Guardrails: `frontend/src/lib/guardrails.js`, the local screen (crisis, secrets, injection, PII, violence/unsafe, individual care, partisan framing) plus a keyword health-topic check for demo mode.
- `frontend/src/lib/agents.js`: the fixed trial stakeholders (categories participant, site, oversight, sponsor, data), relations, stance scale and `stanceColor()`. Shared by the graph, the analysis panel and the OpenAI schema.
- Tools (hash routes `#/build`, `#/preflight`, `#/timeline`, lazy-loaded): `lib/studyBuild.js` + `StudyBuildPage.vue`, `lib/documentPreflight.js` + `PreflightPage.vue`, `lib/bottleneckTimeline.js` (plan-agnostic CPM; `TRIAL_STARTUP_PLAN` and `ONBOARDING_PLAN`) + `TimelinePage.vue`. The preflight and timeline logic and their tests were ported from PR #2. Exports use `createArtifact()` (fingerprinted JSON) and `csvCell()` from `lib/records.js`.
- Shared helpers (use these; don't re-implement): `lib/storage.js` (`readJson`/`writeJson`), `lib/download.js`, the `lazy()` async-component helper in `App.vue`, and global `.tool-page` / `.panel` / `.metric` / `.field` / `.mini-btn` / `.primary-btn` / `.link-btn` / `.code-text` styles in `style.css`.
- `frontend/src/components/ui/`: vendored shadcn-vue (Reka UI) and Inspira UI components. Restyle them through tokens; edit them only to fix bugs.
- `DESIGN.md`: the design system. Follow it for any UI change: lowercase chrome, mono labels, one coral accent, hairlines instead of shadows, muted `--kg-*` category colors, and motion that respects `prefers-reduced-motion`.

## Gotchas

- Use `animate` in motion-v, not `whileInView`. `whileInView` throws when an ancestor is `display: none` (for example, chat hidden in graph view) and breaks Vue's re-render.
- GSAP and `requestAnimationFrame` pause in background tabs. Anything that gates the UI (the boot screen) needs a timer fallback.
- Geist Mono lacks some glyphs (e.g. `⮡`). Draw rare symbols as inline SVG or a CSS mask.
- Evidence: credibility outranks relevance only at 60/40, and sources below `MIN_RELEVANCE` (0.2) are dropped. Keep both visible in the provenance tab. Never add a source the agents didn't see, and never let a claim through without validated `S#` ids or the "uncited" flag.
- `readJson` in `server/security.js` takes an optional size limit; sync uses `SYNC_BODY_LIMIT` (records with deliberations exceed the 16 KB default).
- The privacy list in "model & data" must describe every place data goes: browser storage, opt-in cloud backup, OpenAI, and the scholarly search queries. Update it with any new data flow.
- MiniLM cosine scores for short queries are low (real matches are around 0.2–0.3), so the semantic threshold is 0.2. Don't "fix" it back up.
- OpenAI mode stops the 24s demo playback as soon as the analysis returns, so follow-ups aren't blocked; the graph and sidebar follow the analysis status (`effectiveStatus`).
- The vendored `Command` has a cmdk-style `shouldFilter` prop and an `update:searchTerm` emit. The palette ranks results itself.
- The embedding model (~23 MB) comes from the Hugging Face CDN on first use and is then browser-cached. The onnx wasm (~27 MB) ships in `dist`. For a fully offline venue, warm the cache before judging.
- `.mono` lowercases text. That's right for chrome, wrong for user content: inputs and textareas are exempt, and extracted or user data uses `.code-text`.
- A tab opened before a deploy can request chunk files that no longer exist. `main.js` reloads once on `vite:preloadError`, and `lazy()` shows a retry otherwise.
- Persisted keys: `microfish:preflight`, `microfish:timeline`, `microfish:study-build`, settings and the workspace. Keep `deleteAllData()` in `useResearch.js` in sync when adding one.
- Easter egg: ↑ ↑ ↓ ↓ K I N G outside text fields shows `fx/JumpScare.vue` (no flashing; reduced motion means no zoom or sound).
- Vue Flow's `fit-view-on-init` runs before the pane settles. `SimulationGraph` re-fits on resize, so keep that.

## Skills (say the trigger phrase)

- "ship it": `ship-it`. Branch, commit, push and open a PR, authored by the user.
- "demo ready" / "prep the demo": `demo-ready`. Green build, rehearse the golden path in the browser, write `DEMO.md`, plan B.
- "write the devpost" / "submission": `devpost-writeup`. `SUBMISSION.md` built from real code and commits, honest about what's mocked.
- "what should we cut" / "N hours left": `scope-cut`. Impact versus effort triage and a timeboxed plan.
- "deploy" / "give me a link": `deploy-preview`. Static preview deploy after confirming the provider.
- "de-slop" / before finishing any change: `de-slop`. Audit the diff for code and writing anti-patterns (duplicates, primitive obsession, over-abstraction, mirrored tests, redundant comments, inconsistent conventions, hype copy). Read and extend `.claude/skills/de-slop/LOG.md`.

## Guardrails, privacy and data (non-negotiable)

- Scope is community-level healthcare and public-health scenarios only. Order of checks: `screenPrompt` (local) → demo: health-topic keywords / OpenAI: moderation on the input → the model's own `in_scope` check (schema enum) → moderation on the generated text (flagged text is redacted, scores kept).
- The OpenAI key lives in memory by default. The opt-in "remember" uses sessionStorage only. Never write it to localStorage, IndexedDB, logs, records or exports, and never route it through the backend.
- Every run gets a research record (demo runs too). Records carry provenance (resolved model, temperature, seed, prompt version, system fingerprint, tokens, latency, guardrail results) and a SHA-256 fingerprint. Don't add fields without bumping `RECORD_SCHEMA_VERSION`.
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
