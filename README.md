# Microfish simulation workspace

A Vue and Vite workspace with ChatGPT-style simulation conversations. Create a new chat for each scenario, switch between chats while runs continue, and keep separate drafts and run histories. The sidebar supports search, rename, and delete. Chat, graph, and split views show the selected conversation.

## Run locally

```sh
npm run install:all
npm run dev        # Vite dev server
npm test           # frontend + backend suites
npm start          # build, then serve everything from one Express process
```

## What it does (Track 2: AI for clinical research)

- **Stakeholder rehearsal:** describe a protocol or operations change (fewer visits, e-consent, evening hours) and see how participants, sites, oversight, sponsor and data teams would likely respond, as a knowledge graph plus a stance table.
- **Study build:** paste a protocol's schedule of activities to get a visit × assessment matrix, a draft CRF, edit checks and participant/site burden. Paste a source note to get extracted values and auto-generated queries (out of range, missing, outside visit window).
- **Document preflight:** local checks across protocol, consent and onboarding text: mismatched study IDs or visit counts, outdated versions, open questions, each with its source line.
- **Start-up timeline:** delay any start-up step (ethics review, contracts, EDC build…) and see whether first participant in moves.

## Modes

- **Demo (default):** 12 illustrative agents and a local playback. No model is called and nothing leaves the browser.
- **Your OpenAI key:** open **model & data**, paste a key and verify it, then pick a model. Each scenario is screened (local rules plus OpenAI moderation), then all 11 stakeholder groups are scored in one structured request. The key and scenario go **directly from the browser to api.openai.com**; there is no microfish server-side key, proxy or database. The key stays in memory unless you opt into "remember for this tab".

Every run is saved as a research record in IndexedDB, with prompt, guardrail results, provenance (model, temperature, seed, prompt version, latency, tokens) and a SHA-256 fingerprint. Export a run or the whole workspace as CSV (long format) or JSON. Deleting a chat deletes its records; **delete all local data** wipes everything.

## Current behavior

Runs are explicitly labeled local demos: each lasts about 24 seconds and illustrates 12 sample agents. Multiple chats can run concurrently; each chat allows one active run. Stop affects only that chat. Follow-up questions start additional runs in the same conversation. The graph is an illustrative topology, not an AI-generated result.

Conversations, drafts, and active selection are saved in this browser's local storage. Reloading restores demo progress from elapsed time, including demos whose duration has already elapsed. This is local playback recovery; no server work runs while the browser is closed. Limits are 40 chats per browser and 30 runs per chat, with visible notices when capacity or browser storage is unavailable. If another tab changes saved chats, this tab pauses saving and shows a reload notice to prevent overwriting those changes; copy any unsaved text before reloading.

## Verification

```sh
cd frontend
npm test
npm run build
```

The deterministic controller tests cover concurrent runs, isolation, stop/delete behavior, history and draft persistence, reload recovery, and storage failures.

## Connecting a simulation engine

`frontend/src/lib/simulationWorkspace.js` owns session-scoped run IDs and lifecycle changes; `frontend/src/composables/useSimulationWorkspace.js` connects it to Vue. Replace the demo `startRun`/`tick` lifecycle with backend job creation and event or polling updates, routing all results by session and run ID. Wire cancellation to the backend, and replace illustrative assistant messages and graph data with real output. AI providers, document ingestion, server persistence, and authentication are not connected. Keep secrets on the server, never in client code or committed `.env` files.
