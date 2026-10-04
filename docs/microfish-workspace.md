# Microfish simulation workspace

A Vue and Vite workspace with researcher Google sign-in, an optional OpenAI API-key connection, and simulation conversations. Create a new chat for each scenario, switch between chats while runs continue, and keep separate drafts and run histories. The sidebar supports search, rename, and delete. Chat, graph, and split views show the selected conversation.

## Run locally

```sh
npm ci
npm ci --prefix frontend
npm run dev --prefix frontend
```

The login page is at `/#/login`, with two separate entry cards. **Explore the sample case** opens the interactive REST-101 knowledge graph at `/#/case` without credentials. **Start your own research** uses Google sign-in and an optional **Connect OpenAI** API key. See [AUTH_SETUP.md](../AUTH_SETUP.md) for callback URLs and server environment variables.

In **02 · Your research**, signed-in researchers select a university or institution before opening their personal workspace. Search the starter university list by name or abbreviation, enter an unlisted institution, or choose independent researcher. The choice is saved separately for each Google account in this browser and can be changed from the account screen. **01 · Explore a sample** never requires university onboarding, even when the researcher is signed in.

## New simulation setup

**New simulation** opens a centered setup dialog. Combine an overview, PDF/Markdown/text documents, ZIP archives containing those formats, and an editable voice transcript. Canceling creates no chat. Saving creates the chat and its draft question; press **Run simulation** to start. **Review setup & sources** reopens the saved context. Each chat keeps its own context, and an active run uses the snapshot captured when it started.

Documents are parsed locally. Scanned PDFs need selectable text; OCR and Word files are not supported. Limits are 12 documents, 15 MB per file, 30 MB expanded ZIP content, 40,000 characters per document or transcript, 10,000 overview characters, and 120,000 combined context characters. Imports report errors instead of silently truncating research text.

Voice dictation supports browser speech recognition with pause/resume and editable text. Availability and speech processing depend on the browser. Signed-in researchers with an OpenAI connection can also use segmented OpenAI dictation. Failed segments can be retried or discarded; recordings stay in memory and are not saved in chat storage. OpenAI transcription is billed to the connected account. Review the transcript before saving.

## University IRB context

For personal simulations with an OpenAI connection, setup searches the selected university's approved official domains, then retrieves public pages and text PDFs to verify source excerpts. Research documents and transcripts are not sent to university websites. The dialog shows sources, retrieval date, reviewer backgrounds, policy excerpts, and verification warnings. Reviewers use public professional profiles only when the retrieved evidence supports their name and IRB role; otherwise, they are explicitly labeled composite reviewers. Unlisted institutions and independent researchers use composites rather than an unverified roster.

Institution snapshots are signed on the server, expire after eight hours, and belong to the current sign-in session. Refresh sources in setup if a snapshot expires. AI outputs are fictional planning perspectives informed by public information, never statements by the real person or institutional decisions. The sample demo never requests institution profiles.

## Interactive simulation graph

Choose **Graph** or **Split** to explore an interactive network. Drag nodes or the canvas, scroll or pinch to zoom, and click a node for its properties and connections. Search jumps to matching nodes; the entity legend filters types. Controls include pinning, label visibility, pause/resume, fit, reset, and fullscreen. Labels avoid overlaps and remain readable while zooming. Keyboard users can Tab to a node and press Enter to inspect it; on the canvas, arrow keys pan, `+`/`-` zoom, `0` fits, and Escape closes details. Reduced-motion preferences disable automatic layout animation.

An illustrative sample graph is available before starting a run. Run graphs are seeded per run and update without resetting the layout as progress changes. Graph selections and layout controls reset when switching chats. Data remains a local demo, not real simulation findings.

## Current behavior

The composer lets researchers choose a local demo or an OpenAI exploration. Demo runs last about 24 seconds and illustrate 12 sample agents. OpenAI runs require Google sign-in and an explicitly connected API key, and make three model requests using the saved institution reviewers or the default research coordinator, participant, and study operations perspectives. API usage is billed to the connected OpenAI API account. Results are generated planning hypotheses, not empirical findings. Multiple chats can run concurrently; each chat allows one active run. Stop affects only that chat. Follow-up questions send the current question and the chat's saved context, without the previous conversation history. The graph is an illustrative demo topology and is not shown as an AI result.

Conversations, drafts, and active selection are saved in this browser's local storage. Demo work and each Google account use separate storage keys. Switching workspaces stops active runs and saves the previous workspace. Reloading restores demo progress from elapsed time, including demos whose duration has already elapsed. This is local playback recovery; no server work runs while the browser is closed. Limits are 40 chats per workspace and 30 runs per chat, with visible notices when capacity or browser storage is unavailable. If another tab changes saved chats, this tab pauses saving and shows a reload notice to prevent overwriting those changes; copy any unsaved text before reloading.

## Sample case study

The sample opens directly to a knowledge graph with **60 fictional agents** across research, ethics, training, operations, data access, and participant perspectives. Its 69 nodes and 131 connections tie each agent to specific case evidence and dependencies. A local scripted walkthrough advances through all 60 reviews; pause, step forward, change speed, or replay it. Select agents or activity entries to inspect their notes and connected case details. Search, drag, pan, zoom, and filter the graph without resetting playback. Reduced-motion preferences start the walkthrough paused. No model requests are made by this sample.

**Read the case brief** opens the original comparison, with a button back to the graph. The sample also links to document preflight and the bottleneck timeline. The graph is separate from the 12-agent chat demonstration and does not change personal simulation data or university onboarding.

The fictional case follows Alex's six-week REST-101 research rotation. Both plans start October 5, 2026 and retain the same five-working-day complete-packet review. Under the case's invented assumptions, checking training evidence earlier and preparing an empty environment during review moves readiness from November 2 to October 19. The overview computes these reference schedules separately from the interactive seven-task bottleneck exercise. The 14-day difference is illustrative, not a measured product result.

## Bottleneck timeline

Open **Bottleneck timeline** in the workspace sidebar, or visit `/#/timeline`. The page uses a fictional REST-101 onboarding plan with seven tasks, owners, and prerequisites. Select a task to inspect its dependencies and add 0–15 working days of delay. The timeline recalculates downstream dates, parallel-task flexibility, the critical path, and the final handoff's distance from its target. Dashed bars preserve the baseline for comparison; **Reset scenario** clears all added delays.

The schedule starts October 5, 2026 and uses Monday–Friday working days without holiday closures. Dates are start-of-day boundaries: a two-day task beginning Monday is ready on Wednesday. This is a deterministic planning scenario. It does not submit paperwork or represent actual institutional access or decisions. Task selection and delays save separately from simulation chats in browser local storage. Returning to a chat preserves its draft and running demo. Browser back/forward and direct timeline links are supported.

`frontend/src/lib/bottleneckTimeline.js` contains the dependency calculation and sample tasks; `frontend/src/components/BottleneckTimeline.vue` provides the page.

## Document preflight

Open **Document preflight** in the workspace sidebar, or visit `/#/preflight`. The demo starts with a fictional REST-101 packet and six findings across missing items, conflicting instructions, outdated versions, and unanswered questions. A new personal workspace starts with an empty packet. Each account's documents and review state are saved separately from the demo in this browser. Filter findings, expand their exact source lines, edit the documents, mark findings reviewed, and export a Markdown review. Editing a packet clears its previous findings until you rerun the check. Reviewing a finding records its review status; it does not change the source document.

Add `.txt`, `.md`, or `.markdown` files, or paste document text. The first upload or new pasted document replaces the example packet, with Undo available. Document type and version are editable; filename-based type guesses should be checked. PDF and Word parsing are not included. The limits are 12 documents, 100,000 characters per document, and 500,000 characters per packet. Documents and review state save in browser local storage; the checker sends no document text to a server.

The local rules check for protocol, consent, and onboarding documents; explicit `Study ID:` and onboarding `Contact owner:` fields; conflicting study IDs and `Clinic visits:` counts; numeric versions for the same study/document type; and unresolved `TODO`, `TBD`, `[?]`, or `Question:` lines. An `Answer:` on the same or next nonempty line can resolve a question. Text checks support basic Markdown field formatting. Version numbers alone do not establish approval, and no findings does not establish completeness. These checks do not perform semantic AI review or grant institutional approval.

`frontend/src/lib/documentPreflight.js` contains the rules and example packet; `frontend/src/components/DocumentPreflight.vue` provides the page.

## Verification

```sh
npm run test:server
npm test --prefix frontend
npm run build --prefix frontend
```

The deterministic controller tests cover concurrent runs, isolation, stop/delete behavior, history and draft persistence, reload recovery, and storage failures.

## AI provider integration

`frontend/src/lib/simulationWorkspace.js` owns session-scoped run IDs and lifecycle changes; `frontend/src/composables/useSimulationWorkspace.js` connects it to Vue and the authenticated `/api/simulate` endpoint. AI progress completes only on a successful server response. Reloading interrupts an in-flight AI run and restores its question for retry. Stopping prevents late output from overwriting the chat; OpenAI may still charge for requests already received. `server/` holds Auth.js Google authentication, encrypted session-bound provider credentials, and the bounded OpenAI Responses requests. API keys never enter localStorage. Saved work, including imported text and transcripts, is separated by Google account and demo scope in the browser profile; this separation is not encryption or cloud sync. Word ingestion and server-side chat persistence are not implemented.


## Deploy to Vercel

The repository-root `vercel.json` installs server and frontend dependencies, builds the Vite frontend, publishes `frontend/dist`, and deploys the `/api` Vercel Functions. Link the repository from the Vercel CLI with `vercel link`, then deploy a preview with `vercel deploy` or production with `vercel deploy --prod`. Configure authentication using [AUTH_SETUP.md](../AUTH_SETUP.md). For automatic preview deployments on branches and production deployments from `main`, connect the `kevinkiyosepyo/healtlink-avengers` GitHub repository to the Vercel project in Project Settings.
