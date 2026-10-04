# Research simulation workspaces

This repository serves two existing workspaces from one build:

- **Microfish** at `/`: researcher sign-in and university selection, document and voice intake, saved simulation chats, and the interactive REST-101 sample with 60 fictional agents at `/#/case`.
- **Lookahead** at `/research.html`: clinical-trial stakeholder rehearsal, evidence deliberation, source library, study build, preflight, start-up timeline, and optional cloud backup.

Each workspace links to the other. Their existing browser storage keys are preserved. The Microfish sample uses a scripted local walkthrough; it does not make 60 model calls. University onboarding applies only to Microfish's personal research entry, never the sample.

<<<<<<< Updated upstream
## Run and verify
=======
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

## Evidence deliberation (your-key mode)

After the stakeholder scores, five agents deliberate: a clinical trialist, a participant-engagement scientist, a biostatistician, a regulatory and ethics reviewer, and a site-operations lead.

1. The model plans literature queries and the metric to estimate.
2. **Scholarly sources first:** OpenAlex, Europe PMC (including PubMed) and ClinicalTrials.gov, queried straight from your browser. Retracted papers and off-topic results are removed; the rest are ranked by a transparent credibility score (study design, peer review, citations per year, recency) and relevance.
3. **Web search second:** OpenAI's web search, keeping only credible domains (agencies, journals, academic institutions). Excluded links are listed.
4. Agents state positions with arithmetic and cited sources (`S1`, `S2`, …), rebut each other, and revise. A moderator writes the group decision. lookahead also computes an independent confidence-weighted cross-check of the agents' estimates.
5. The **provenance** tab shows every query, database response, source (with link, credibility breakdown and which claims cite it) and excluded link. Invalid citations are dropped and uncited claims flagged.

## Source library (bring your own sources)

Open **source library** and add PDFs, text, markdown or CSV files, or paste notes (site reports, survey summaries, protocol sections, policy memos). They're chunked and embedded in your browser. During each deliberation the closest passages join the evidence as `S#` sources marked "team document · not externally verified", and the provenance tab shows the document, page, line and similarity. Only matched excerpts are sent to OpenAI; the documents themselves stay on your device and aren't part of cloud backup. Scanned PDFs need OCR first.

## Voice

Press the mic in the composer (or ⌘⇧Space) and keep talking: lookahead transcribes each phrase as you pause, removes fillers, understands "comma", "new line" and "scratch that", and submits when you say "run it". On the consensus, **listen** reads the group decision aloud. With your OpenAI key, audio goes only to OpenAI for transcription; without one, the browser's speech service is used.

## Deploy

Production is Vercel only: `vercel --prod` builds `frontend/dist` and the `api/` functions for Google sign-in (`vercel.json`; env vars in `AUTH_SETUP.md`). There is no cloud storage; chats, records and the source library stay in the browser.

## Modes

- **Demo (default):** 12 illustrative agents and a local playback. No model is called and nothing leaves the browser.
- **Your OpenAI key:** open **model & data**, paste a key and verify it, then pick a model. Each scenario is screened (local rules plus OpenAI moderation), then all 11 stakeholder groups are scored in one structured request. The key and scenario go **directly from the browser to api.openai.com**; there is no lookahead server-side key, proxy or database. The key stays in memory unless you opt into "remember for this tab".

Every run is saved as a research record in IndexedDB, with prompt, guardrail results, provenance (model, temperature, seed, prompt version, latency, tokens) and a SHA-256 fingerprint. Export a run or the whole workspace as CSV (long format) or JSON. Deleting a chat deletes its records; **delete all local data** wipes everything.

## Current behavior

Runs are explicitly labeled local demos: each lasts about 24 seconds and illustrates 12 sample agents. Multiple chats can run concurrently; each chat allows one active run. Stop affects only that chat. Follow-up questions start additional runs in the same conversation. The graph is an illustrative topology, not an AI-generated result.

Conversations, drafts, and active selection are saved in this browser's local storage. Reloading restores demo progress from elapsed time, including demos whose duration has already elapsed. This is local playback recovery; no server work runs while the browser is closed. Limits are 40 chats per browser and 30 runs per chat, with visible notices when capacity or browser storage is unavailable. If another tab changes saved chats, this tab pauses saving and shows a reload notice to prevent overwriting those changes; copy any unsaved text before reloading.

## Verification
>>>>>>> Stashed changes

```sh
npm run install:all
npm run dev
npm test
npm run build
npm start
```

`npm run dev` serves both entries with the same local API. `npm start` builds and serves them with Express. The Vercel configuration builds both HTML entries and deploys the shared API functions.

## Details

- [Microfish features and limitations](docs/microfish-workspace.md)
- [Lookahead research tools and data flow](docs/research-workspace.md)
- [Authentication and environment setup](AUTH_SETUP.md)
- [AWS cloud backup deployment](infra/aws/README.md)

Microfish connects an OpenAI key through encrypted, session-bound server credentials. Lookahead's model-and-data settings keep its own OpenAI key in browser memory or optional tab storage and call OpenAI directly. Neither workflow writes provider keys into saved research records. These are separate connection flows.
