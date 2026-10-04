# Researcher sign-in and AI connections

Lookahead opens at `/#/login`. Research tools live at `/#/research` inside the same workspace. The legacy `/research.html` entry opens this same app. Light and dark appearances share the same Google session, provider connections, and saved simulations.

Researchers can sign in with a verified Google account, including a consumer Gmail account, and enter the workspace in demo mode without connecting AI. The app does not restrict sign-in to a school or email domain. Google requests only `openid email profile`; it does not access Gmail messages. Gmail mailbox access is not implemented.

After Google sign-in, researchers can connect their own OpenAI or Anthropic API key from the login/account page to run AI simulations. Key entry is optional for using the workspace and demo. OpenAI API usage is billed to the connected API account, separately from any ChatGPT subscription. The app does not offer OpenAI or ChatGPT OAuth.

## Connect Anthropic

Sign in with Google, then enter your API key in **Connect Anthropic**, directly below OpenAI. Create keys in the [Anthropic Console](https://platform.claude.com/settings/keys). Leave the optional workspace ID blank for a key scoped to one workspace. For a multi-workspace key, copy its `wrkspc_…` ID from [Console Workspaces](https://platform.claude.com/settings/workspaces); the server includes it on every Messages request. Choose Anthropic in the simulation provider menu. You can connect either or both providers; disconnecting one leaves the other connected. API usage is billed separately from a Claude subscription.

`ANTHROPIC_MODEL` is optional and defaults to `claude-haiku-4-5-20251001`. Each provider connection makes one short, billed generation request against the model used by simulations, capped at 16 output tokens. Only a successful, completed response marks the connection ready. This checks inference permissions, model access, and available credit without requiring Models read permission. The login form discloses this test before connection. Institution lookup supports either connected provider and can use verified direct official sources without a model search. Audio transcription through `/api/transcribe` still requires an OpenAI connection; browser dictation remains a separate option.

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
   | `ANTHROPIC_MODEL` | Optional; defaults to `claude-haiku-4-5-20251001` |

4. Redeploy for the environment variables to take effect. Register a separate exact origin/callback if enabling sign-in on a preview deployment. Do not copy the production origin to a differently hosted preview.
5. Sign in with Google, then enter an OpenAI project API key in **Connect OpenAI** on the login/account page. The key needs Responses write permission and access to the configured model, with API billing enabled. Models read permission is not required. Researchers can also open the workspace in demo mode without a key.

Never commit secrets or prefix them with `VITE_`. Configure them directly in Vercel or a local ignored `.env`; do not paste them into chat.

Production Google sign-in is now configured in Vercel. `AUTH_URL`, `AUTH_SECRET`, `AUTH_GOOGLE_ID`, and `AUTH_GOOGLE_SECRET` are stored as server-only environment variables, and the app has been redeployed. The live account endpoint reports `configured: true`. Keep the existing production secret rather than rotating it unnecessarily, since rotation signs out current sessions.

The configured production callback is `https://health-link-hackathon.vercel.app/api/auth/callback/google`. The OAuth audience is currently **Testing**. Because this app requests only `openid email profile`, [Google’s basic sign-in exception](https://support.google.com/cloud/answer/15549945) applies: users do not need to be listed as test users, Testing does not add its warning, and authorizations do not expire after seven days. Adding other scopes would change this behavior. Live Google sign-in was verified on October 3, 2026 with both a Workspace account and a consumer Gmail account: the production site opened Google’s account chooser, requested only name/profile/email access, completed the callback, and displayed the connected researcher. This worked without adding test users. These checks did not grant Gmail mailbox access or make a live OpenAI API request.

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

A live-site session does not sign the researcher into a separate localhost or preview origin. Each enabled origin needs matching OAuth configuration.

## Behavior and limits

- Auth.js manages Google's OAuth flow, CSRF tokens, and encrypted session cookies. Only verified Google email accounts are accepted. Sessions expire after eight hours.
- Vercel uses explicit function entrypoints at `api/auth/signin/google.js` and `api/auth/callback/google.js` for the nested OAuth routes. Keep these wrappers: the standalone `api/auth/[...auth].js` route handled single-segment endpoints but did not route `/api/auth/signin/google` or `/api/auth/callback/google` in production.
- Each submitted API key is verified server-side, encrypted with a provider-specific key derived from `AUTH_SECRET`, and stored in a separate HttpOnly cookie. HTTPS deployments use Secure cookies. The encrypted connection is bound to that researcher and login session, expires with it, and is removed on that provider’s disconnect or sign-out. Signing out clears both provider cookies. The plaintext key is never returned by an API, saved in localStorage, bundled, or logged.
- A temporary account refresh failure retains the last confirmed identity and connections, with a visible error. Successful connection, disconnect, and sign-out operations update the page immediately, even if the following account check fails. A successful signed-out response clears them. Connection requests allow 55 seconds on the client for the server's 45-second provider timeout; Vercel connection and simulation functions allow 60 seconds.
- An AI run makes three parallel requests to the selected provider: OpenAI Responses or Anthropic Messages. With a university snapshot, these use sourced or clearly labeled composite research-ethics reviewer profiles; otherwise they use fictional research coordinator, participant, and study operations perspectives. Both use a bounded prompt and output and a 45-second provider timeout. OpenAI requests set `store: false`. Usage is billed to the selected provider’s connected API account. Live inference has not been verified; demo runs do not make these requests.
- These outputs are exploratory planning hypotheses, not measured findings, clinical advice, or a validated multi-agent population model. The graph and timeline still use illustrative/local data.
- The primary workspace sends the submitted question plus the active simulation's saved overview, editable transcript, imported document text, and signed university snapshot. Other chats and preflight documents are not automatically included. Saved chats, document packets, and timeline changes use separate browser storage keys for the demo and each Google account. They are not automatically synced to a cloud database, and browser storage is not encrypted. API keys remain separate in the encrypted HttpOnly session cookie.
- Selecting a university starts a profile lookup. `/api/institution-preview` reads an audited catalogue of public official sources without a login, API key, or model request. `/api/institution` requires Google sign-in and a connected OpenAI or Anthropic account, first checks verified direct sources, and uses provider-assisted official-domain discovery if needed. Only the university is sent for this lookup; study documents are not sent to university websites or included in the discovery prompt. Named profiles require verified membership evidence; unavailable or unreadable rosters produce labeled composites.
- Authenticated profiles receive a server signature bound to the researcher and login. Personal AI runs automatically obtain a matching fresh snapshot before submitting study context. Public preview profiles are unsigned and cannot replace a signed personal-run snapshot. The university preview is available below Document preflight in the Workspace sidebar; the sample entry still skips university onboarding.
- Browser dictation uses the browser's speech service when available. OpenAI dictation sends bounded audio segments through `/api/transcribe` using the connected researcher key. Audio is kept in memory during capture; editable transcript text is saved with the simulation. Imports are read locally until their extracted text is submitted in a simulation.
- Research tools use the same encrypted provider connection as simulations. Source documents and evidence reviews are saved under the current account’s browser storage key, separate from the demo. An explicit evidence review sends the current study setup and matched passages to the selected provider, and search terms to OpenAlex, Europe PMC, and ClinicalTrials.gov. The server validates signed university context and citation IDs. No cloud backup or browser-held API-key flow is mounted.
- Stop cancels the browser request and prevents late results from changing the chat. An upstream request already sent may still finish and incur API usage. Reloading interrupts an AI run; it is never completed using a demo timer.

## Checks

```sh
npm run test:server
npm test --prefix frontend
npm run build --prefix frontend
```

Server tests exercise authentication, request origin checks, encrypted credential binding/expiry, input limits, provider failures, and response handling with mocked network requests. Fresh-researcher HTTP tests cover verified Gmail identities, connection checks, encrypted cookies, both simulation providers, workspace headers, account isolation, disconnect, sign-out, and expiry. Browser checks cover a new Anthropic-only researcher entering and running their own simulation with mocked API responses. These tests do not themselves verify Google consent or billable provider calls. Google consent and callback were separately verified on the live production site on October 3, 2026, including a consumer Gmail account; live OpenAI and Anthropic calls remain untested.

References: [Auth.js Google setup](https://authjs.dev/getting-started/providers/google), [Google web-server OAuth](https://developers.google.com/identity/protocols/oauth2/web-server), [OpenAI API authentication](https://developers.openai.com/api/reference/overview#authentication).
