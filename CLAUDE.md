# Lookahead workspace

Vue + Vite in `frontend/`, shared authenticated API handlers in `server/`, Express in `backend/`, and Vercel function wrappers in `api/`.

- Install: `npm run install:all`.
- Development: `npm run dev` (Vite, with the same API middleware).
- Verify: `npm test && npm run build`.
- Production: `npm start` builds and serves one app through Express; `vercel.json` configures Vercel.

## Product scope

Lookahead supports research preparation and simulation: study context, document/voice intake, university-informed fictional reviewer perspectives, multiple simulation chats, an interactive graph, document preflight, and a bottleneck timeline. Research tools add sources, explicit cited evidence reviews, and history exports inside the same workspace.

The sample opens a scripted knowledge graph with 150 fictional agent perspectives, formed from 30 roles and five review lenses. Open playback at 140/150 reviewed, with the prepared sample report and final conclusions available independently of playback. Include explicit IRB roles, and distinguish these scripted perspectives from real people or model calls. Never require sign-in or university onboarding for the demo. University selection belongs only to the personal research entry.

There is one layout and simulation controller. Light mode keeps the white/blue appearance; dark mode uses the warm charcoal/coral palette. Theme changes must not navigate, reload, remount, switch storage, or reset drafts, graph selections, modal inputs, or active runs.

## Project map

- `frontend/src/App.vue`: shared app shell, sidebar, account flow, simulation chats, and tool navigation.
- `bootstrap.js`, `main.js`, `research-main.js`: both HTML entrypoints mount the same app. The legacy research entry normalizes old bookmarks.
- `components/WorkspaceModeToggle.vue`, `composables/useWorkspaceTheme.js`, `workspace-theme.css`, `public/theme-init.js`: appearance. Keep the boot script’s storage key and colors consistent with the composable.
- `lib/simulationWorkspace.js`, `composables/useSimulationWorkspace.js`: concurrent runs, isolated chat state, storage, and cancellation. Preserve their contracts during UI work.
- `components/NewSimulationDialog.vue`, `lib/simulationContext.js`, `lib/simulationImports.js`: bounded, explicit study setup. Do not silently truncate source material.
- `components/SampleCaseGraph.vue`, `lib/sampleCaseGraph.js`: the scripted sample; agent counts come from the fixture rather than documentation constants. `SimulationGraph.vue` shows illustrative chat topology.
- `components/ResearchTools.vue`, `composables/useResearchTools.js`, `lib/researchTools.js`: sources, keyword retrieval, cited reviews, history, and exports.
- `server/evidence.js`, `server/handlers.js`: fixed-host scholarly retrieval, signed context validation, and one bounded model review. Source IDs must belong to the actual supplied source pack; mark uncited claims.
- `components/LookaheadLogo.vue`, `components/LookaheadIntro.vue`: visible branding and the dismissible 1.35-second session introduction. Preserve reduced-motion and interaction dismissal. The login headline is **Predict the Future**.
- `components/UniversitySimulationPreview.vue`, `components/UniversityIRBPanel.vue`, `composables/useInstitutionProfile.js`, `lib/institutionProfile.js`: public-source preview and automatic signed context for personal simulations. Keep the preview below Document preflight, not on the login page.
- `server/publicInstitution.js`, `server/institutions.js`, `server/officialSources.js`: audited public source retrieval, evidence-checked profiles, and provider-assisted discovery. Either connected provider can support signed lookup; do not infer missing member identities.
- `components/BottleneckTimeline.vue`, `components/DocumentPreflight.vue`: account-scoped Workspace tools. `lib/preflightImports.js` accepts text/Markdown directly or in ZIPs; preflight limits differ from study setup, and PDF preflight parsing is unsupported.
- `server/auth.js`, `server/security.js`, `composables/useResearcherAccount.js`, `components/ResearcherLogin.vue`: Google identity plus encrypted, session-bound OpenAI/Anthropic connections. See `AUTH_SETUP.md`.

The old standalone Lookahead app, direct browser API-key flow, cloud backup, automatic debate pipeline, study builder, and the old theatrical boot/easter-egg UI are not mounted. This does not refer to the short Lookahead brand introduction. Some old utilities remain because the active tools reuse their pure helpers or existing tests cover them. Do not reconnect these flows during routine maintenance.

## Data and behavior

- Demo and each Google account have distinct browser storage scopes. Research tools use `${simulationStorageKey}:research-tools.v1`. Do not automatically migrate global legacy records into a personal account.
- Appearance uses the account-independent `microfish:workspace-theme` key. It is a preference, not a workspace identity.
- Keys never enter localStorage, IndexedDB, exports, records, or logs. Provider requests use the authenticated server integration. Keep Anthropic workspace IDs bound to their encrypted credential cookie.
- Imported text stays local until the user explicitly runs a simulation or evidence review. Explain what is sent to the selected provider and scholarly search services.
- Switching accounts stops pending work and prevents late results from crossing scopes. Theme switching must not stop it.
- Graph/demo output is illustrative, not empirical evidence. University-informed reviewer output is fictional and does not state a real person’s opinion or institutional decision.
- All visible product branding is Lookahead. Keep existing `microfish` storage, cookie, token-audience, and prompt-version identifiers stable; renaming them can lose saved work or sign users out.
- The separate Trial Researcher readiness branch and deployment are independent. Do not claim its source-linked readiness engine, DOCX imports, or dictation are part of this app without an explicit integration.
- Respect reduced motion, visible focus, readable contrast, and mobile navigation. The `--ui-*` tokens are shared by both themes. Do not import `research.css` into the active app.

## Verification and working rules

- Browser-check the golden path: sample graph; new simulation dialog; run; switch chat while running; stop; navigate to tools; toggle both themes without losing state.
- Run `npm test && npm run build` before claiming the change works. API tests use mocked providers; do not make paid requests for routine verification.
- Before finishing, read `.claude/skills/de-slop/SKILL.md` and its log. Prefer existing helpers to duplicate implementations; keep UI copy concrete and honest.
- When explicitly invoked, use the repository’s `ship-it`, `demo-ready`, `devpost-writeup`, `scope-cut`, or `deploy-preview` skill.

## Authorship

All commits and PRs use the user’s existing Git identity. Never change identity, add AI co-authorship, or claim an AI authored the change. Never commit directly to `main` or force-push. User instructions control the requested publication scope.
