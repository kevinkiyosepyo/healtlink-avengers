# Microfish simulation workspace

A Vue and Vite workspace with ChatGPT-style simulation conversations. Create a new chat for each scenario, switch between chats while runs continue, and keep separate drafts and run histories. The sidebar supports search, rename, and delete. Chat, graph, and split views show the selected conversation.

## Run locally

```sh
cd frontend
npm install
npm run dev
```

## Interactive simulation graph

Choose **Graph** or **Split** to explore an interactive network. Drag nodes or the canvas, scroll or pinch to zoom, and click a node for its properties and connections. Search jumps to matching nodes; the entity legend filters types. Controls include pinning, label visibility, pause/resume, fit, reset, and fullscreen. Labels avoid overlaps and remain readable while zooming. Keyboard users can Tab to a node and press Enter to inspect it; on the canvas, arrow keys pan, `+`/`-` zoom, `0` fits, and Escape closes details. Reduced-motion preferences disable automatic layout animation.

An illustrative sample graph is available before starting a run. Run graphs are seeded per run and update without resetting the layout as progress changes. Graph selections and layout controls reset when switching chats. Data remains a local demo, not real simulation findings.

## Current behavior

Runs are explicitly labeled local demos: each lasts about 24 seconds and illustrates 12 sample agents. Multiple chats can run concurrently; each chat allows one active run. Stop affects only that chat. Follow-up questions start additional runs in the same conversation. The graph is an illustrative topology, not an AI-generated result.

Conversations, drafts, and active selection are saved in this browser's local storage. Reloading restores demo progress from elapsed time, including demos whose duration has already elapsed. This is local playback recovery; no server work runs while the browser is closed. Limits are 40 chats per browser and 30 runs per chat, with visible notices when capacity or browser storage is unavailable. If another tab changes saved chats, this tab pauses saving and shows a reload notice to prevent overwriting those changes; copy any unsaved text before reloading.

## Bottleneck timeline

Open **Bottleneck timeline** in the workspace sidebar, or visit `/#/timeline`. The page uses a fictional REST-101 onboarding plan with seven tasks, owners, and prerequisites. Select a task to inspect its dependencies and add 0–15 working days of delay. The timeline recalculates downstream dates, parallel-task flexibility, the critical path, and the final handoff's distance from its target. Dashed bars preserve the baseline for comparison; **Reset scenario** clears all added delays.

The schedule starts October 5, 2026 and uses Monday–Friday working days without holiday closures. Dates are start-of-day boundaries: a two-day task beginning Monday is ready on Wednesday. This is a deterministic planning scenario. It does not submit paperwork or represent actual institutional access or decisions. Task selection and delays save separately from simulation chats in browser local storage. Returning to a chat preserves its draft and running demo. Browser back/forward and direct timeline links are supported.

`frontend/src/lib/bottleneckTimeline.js` contains the dependency calculation and sample tasks; `frontend/src/components/BottleneckTimeline.vue` provides the page.

## Document preflight

Open **Document preflight** in the workspace sidebar, or visit `/#/preflight`. The page starts with a fictional REST-101 packet and six findings across missing items, conflicting instructions, outdated versions, and unanswered questions. Filter findings, expand their exact source lines, edit the documents, mark findings reviewed, and export a Markdown review. Editing a packet clears its previous findings until you rerun the check. Reviewing a finding records its review status; it does not change the source document.

Add `.txt`, `.md`, or `.markdown` files, or paste document text. The first upload or new pasted document replaces the example packet, with Undo available. Document type and version are editable; filename-based type guesses should be checked. PDF and Word parsing are not included. The limits are 12 documents, 100,000 characters per document, and 500,000 characters per packet. Documents and review state save in browser local storage; the checker sends no document text to a server.

The local rules check for protocol, consent, and onboarding documents; explicit `Study ID:` and onboarding `Contact owner:` fields; conflicting study IDs and `Clinic visits:` counts; numeric versions for the same study/document type; and unresolved `TODO`, `TBD`, `[?]`, or `Question:` lines. An `Answer:` on the same or next nonempty line can resolve a question. Text checks support basic Markdown field formatting. Version numbers alone do not establish approval, and no findings does not establish completeness. These checks do not perform semantic AI review or grant institutional approval.

`frontend/src/lib/documentPreflight.js` contains the rules and example packet; `frontend/src/components/DocumentPreflight.vue` provides the page.

## Verification

```sh
cd frontend
npm test
npm run build
```

The deterministic controller tests cover concurrent runs, isolation, stop/delete behavior, history and draft persistence, reload recovery, and storage failures.

## Connecting a simulation engine

`frontend/src/lib/simulationWorkspace.js` owns session-scoped run IDs and lifecycle changes; `frontend/src/composables/useSimulationWorkspace.js` connects it to Vue. Replace the demo `startRun`/`tick` lifecycle with backend job creation and event or polling updates, routing all results by session and run ID. Wire cancellation to the backend, and replace illustrative assistant messages and graph data with real output. AI providers, PDF/Word ingestion, server persistence, and authentication are not connected. Keep secrets on the server, never in client code or committed `.env` files.


## Deploy to Vercel

The repository-root `vercel.json` configures Vercel to install dependencies from `frontend/`, run the Vite build there, and publish `frontend/dist`. Link the repository from the Vercel CLI with `vercel link`, then deploy a preview with `vercel deploy` or production with `vercel deploy --prod`. For automatic preview deployments on branches and production deployments from `main`, connect the `kevinkiyosepyo/healtlink-avengers` GitHub repository to the Vercel project in Project Settings.
