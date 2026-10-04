# Researcher sign-in and OpenAI connection

The primary Microfish workspace opens at `/#/login`. The retained Lookahead research workspace opens at `/research.html`; it keeps its source library, evidence deliberation, and optional cloud backup. Both use the same Google session API.

The app starts at `/#/login`. Researchers can sign in with a verified Google account, including a consumer Gmail account, and enter the workspace in demo mode without connecting AI. The app does not restrict sign-in to a school or email domain. Google requests only `openid email profile`; it does not access Gmail messages. Whether Gmail mailbox access is wanted remains to be clarified.

After Google sign-in, researchers can connect their own OpenAI API key from the login/account page to run AI simulations. Key entry is optional for using the workspace and demo. OpenAI API usage is billed to the connected API account, separately from any ChatGPT subscription. The app does not offer OpenAI or ChatGPT OAuth.

## Configure Google sign-in

1. In [Google Cloud Console](https://console.cloud.google.com/apis/credentials), create/select a project and configure its OAuth consent screen. The current `openid email profile` scopes qualify for Google’s basic sign-in exception to Testing restrictions; a test-user list is not required for these scopes.
2. Create an **OAuth client ID**, application type **Web application**. Add these exact authorized redirect URIs:
   - Production: `https://health-link-hackathon.vercel.app/api/auth/callback/google`
   - Local: `http://localhost:5173/api/auth/callback/google`
   - If using the IP address locally: `http://127.0.0.1:5173/api/auth/callback/google`
3. In the Vercel project's **Settings → Environment Variables**, configure these server-only variables for Production:

   | Variable | Value |
   | --- | --- |
   | `AUTH_URL` | `https://health-link-hackathon.vercel.app` |
   | `AUTH_GOOGLE_ID` | The Google OAuth client ID |
   | `AUTH_GOOGLE_SECRET` | The Google OAuth client secret |
   | `AUTH_SECRET` | A random secret, generated with `openssl rand -base64 32` |
   | `OPENAI_MODEL` | Optional; defaults to `gpt-4.1-mini` |

4. Redeploy for the environment variables to take effect. Register a separate exact origin/callback if enabling sign-in on a preview deployment. Do not copy the production origin to a differently hosted preview.
5. Sign in with Google, then enter an OpenAI project API key in **Connect OpenAI** on the login/account page. The key needs Models read permission for the connection check and Responses write permission for simulations, with API billing enabled. Researchers can also open the workspace in demo mode without a key.

Never commit secrets or prefix them with `VITE_`. Configure them directly in Vercel or a local ignored `.env`; do not paste them into chat.

Production Google sign-in is now configured in Vercel. `AUTH_URL`, `AUTH_SECRET`, `AUTH_GOOGLE_ID`, and `AUTH_GOOGLE_SECRET` are stored as server-only environment variables, and the app has been redeployed. The live account endpoint reports `configured: true`. Keep the existing production secret rather than rotating it unnecessarily, since rotation signs out current sessions.

The Google Cloud project is `ambient-topic-437600-v9`, and the Web application OAuth client is **Microfish web**. Its production callback is `https://health-link-hackathon.vercel.app/api/auth/callback/google`. The OAuth audience is currently **Testing**. Because this app requests only `openid email profile`, [Google’s basic sign-in exception](https://support.google.com/cloud/answer/15549945) applies: users do not need to be listed as test users, Testing does not add its warning, and authorizations do not expire after seven days. Adding other scopes would change this behavior. Live Google sign-in was verified on October 3, 2026 with both a Workspace account and a consumer Gmail account: the production site opened Google’s account chooser, requested only name/profile/email access, completed the callback, and displayed the connected researcher. This worked without adding test users. These checks did not grant Gmail mailbox access or make a live OpenAI API request.

## Local development

From the repository root:

```sh
npm ci
npm ci --prefix frontend
cp .env.example .env
# Fill the Google credentials and AUTH_SECRET in .env.
npm run dev --prefix frontend
```

Set `AUTH_URL` to the exact local origin used in the browser. Vite's server middleware provides the same `/api/*` handlers as Vercel Functions. Changing `.env` requires restarting Vite. Without credentials, Google is visibly unavailable and the local demo remains usable.

The current local prototype at `http://localhost:5181` has no authentication environment configured. Its login page offers a link to [the live website](https://health-link-hackathon.vercel.app/#/login), where Google sign-in is configured. A live-site session does not sign the researcher into the separate localhost origin.

## Behavior and limits

- Auth.js manages Google's OAuth flow, CSRF tokens, and encrypted session cookies. Only verified Google email accounts are accepted. Sessions expire after eight hours.
- Vercel uses explicit function entrypoints at `api/auth/signin/google.js` and `api/auth/callback/google.js` for the nested OAuth routes. Keep these wrappers: the standalone `api/auth/[...auth].js` route handled single-segment endpoints but did not route `/api/auth/signin/google` or `/api/auth/callback/google` in production.
- A submitted OpenAI API key is verified server-side, encrypted with a key derived from `AUTH_SECRET`, and stored in an HttpOnly cookie. HTTPS deployments use Secure cookies. The encrypted connection is bound to that researcher and login session, expires with it, and is removed on disconnect or sign-out. The plaintext key is never returned by an API, saved in localStorage, bundled, or logged.
- An AI run makes three parallel OpenAI Responses requests. With a university snapshot, these use sourced or clearly labeled composite research-ethics reviewer profiles; otherwise they use fictional research coordinator, participant, and study operations perspectives. It uses `store: false`, a bounded prompt and output, and a 45-second provider timeout. Usage is billed to the researcher’s connected OpenAI API account. Live inference has not been verified; demo runs do not make these requests.
- These outputs are exploratory planning hypotheses, not measured findings, clinical advice, or a validated multi-agent population model. The graph and timeline still use illustrative/local data.
- The primary workspace sends the submitted question plus the active simulation's saved overview, editable transcript, imported document text, and signed university snapshot. Other chats and preflight documents are not automatically included. Saved chats, document packets, and timeline changes use separate browser storage keys for the demo and each Google account. They are not automatically synced to a cloud database, and browser storage is not encrypted. API keys remain separate in the encrypted HttpOnly session cookie.
- Institution lookup sends the selected university to OpenAI web search and verifies returned claims against public official sources. It does not send study documents with that lookup. Public snapshots are signed, expire with the login, and can be refreshed from simulation setup. Unverifiable members use explicitly composite profiles.
- Browser dictation uses the browser's speech service when available. OpenAI dictation sends bounded audio segments through `/api/transcribe` using the connected researcher key. Audio is kept in memory during capture; editable transcript text is saved with the simulation. Imports are read locally until their extracted text is submitted in a simulation.
- The retained research workspace has its own browser-held OpenAI key flow: keys remain in memory by default, with optional sessionStorage persistence. Only that workspace's explicitly enabled cloud backup uses `/api/sync`; it stores research records and its workspace snapshot, and excludes the source library. Set `SYNC_TABLE` for DynamoDB or `SYNC_MEMORY=1` for temporary local development. Those keys and imported library files are never part of cloud backup.
- Stop cancels the browser request and prevents late results from changing the chat. An upstream request already sent may still finish and incur API usage. Reloading interrupts an AI run; it is never completed using a demo timer.

## Checks

```sh
npm run test:server
npm test --prefix frontend
npm run build --prefix frontend
```

Server tests exercise authentication, request origin checks, encrypted credential binding/expiry, input limits, provider failures, and response handling with mocked network requests. These tests do not themselves verify Google consent or billable OpenAI calls. Google consent and callback were separately verified on the live production site on October 3, 2026, including a consumer Gmail account; live OpenAI calls remain untested.

References: [Auth.js Google setup](https://authjs.dev/getting-started/providers/google), [Google web-server OAuth](https://developers.google.com/identity/protocols/oauth2/web-server), [OpenAI API authentication](https://developers.openai.com/api/reference/overview#authentication).
