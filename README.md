# Microfish research workspace

Microfish is a Vue/Vite research-planning prototype with Google sign-in, concurrent scenario chats, an interactive bottleneck timeline, and document preflight checks. Sample simulations and graphs are explicitly illustrative.

## Workspaces

- **Primary workspace (`/`, `/#/login`):** Google sign-in, chat/split/graph views, timeline dependencies, and document preflight. Researchers can enter without an API key. The local preview links to the configured production sign-in page when local OAuth settings are absent. ChatGPT identity and subscription inference remain unavailable until approved and configured; see [authentication setup](AUTH_SETUP.md).
- **Research workspace (`/researcher.html`):** the existing research interface, semantic search, knowledge graph, stakeholder analyses, and research-record exports. The primary sidebar links to it, and it links back. It defaults to local demo mode. Its optional **model & data** connection uses a researcher-supplied OpenAI key directly from the browser; this existing research workflow is separate from primary onboarding.

Both pages share local scenario conversations. The research page owns its additional IndexedDB analysis records and exports. A primary API-backed run has no stakeholder-analysis record; the research page must not label it a demo or depict its graph as measured output.

## Run locally

```sh
npm run install:all
npm run dev
npm test
npm run build
npm start
```

`npm run dev` serves both pages and the account API with Vite. `npm start` builds and serves both pages from Express (port 8787 by default), including the same account API handlers and `/api/health`. Server configuration loads from the ignored root `.env`; the standalone server also accepts an ignored `backend/.env`. Start without secrets to use the demo, or follow [AUTH_SETUP.md](AUTH_SETUP.md) for Google authentication.

Vercel uses `vercel.json`, builds both HTML entries, and serves the `api/` functions. Google credentials belong in encrypted server-only environment settings, never client code or source control.

## Data handling

- Chats, drafts, and selection stay in this browser profile. They are not cloud-synced or isolated by Google account. Use separate browser profiles on shared devices.
- Google requests only name, email, and profile identity scopes. Gmail mailbox access is not configured.
- Primary onboarding contains no API-key entry. Existing API connections use encrypted, session-bound HttpOnly cookies and server-side OpenAI requests; see the authentication documentation for the exact limits.
- The research page's optional key stays in memory by default; **remember for this tab** uses sessionStorage. That page sends scenarios directly to OpenAI after local screening and provider moderation. It stores research records in IndexedDB, including prompts, model provenance, guardrail results, and a SHA-256 fingerprint. Exports are JSON or CSV. Deleting a chat also deletes its research records.
- Semantic search downloads the embedding model from Hugging Face and computes embeddings locally. Model files are browser-cached. Research text is not sent to the model CDN.
- Demo playback makes no inference requests. AI output is exploratory, uncited planning material, not empirical evidence or medical advice. Stopping a browser request does not guarantee an upstream billable request stops.

## Verification

`npm test` runs the authentication, frontend, and Express suites; `npm run build` builds both workspaces. OAuth and inference unit tests use mocked providers. Google identity sign-in was separately verified in production. ChatGPT-plan inference has not been verified or enabled.

Private conversation archives, personal onboarding notes, local browser evidence, credentials, build output, and dependencies are excluded from the public source snapshot. The included onboarding case study is fictional.
