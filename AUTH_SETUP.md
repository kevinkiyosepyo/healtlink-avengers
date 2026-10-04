# Researcher sign-in and OpenAI connection
> **Renamed:** the product is now lookahead. Update the OAuth consent-screen app name in Google Cloud Console to match; redirect URIs are unchanged.


The app starts at `/#/login`. Researchers can sign in with a verified Google account, including a consumer Gmail account, and enter the workspace in demo mode without connecting AI. The app does not restrict sign-in to a school or email domain. Google requests only `openid email profile`; it does not access Gmail messages. Whether Gmail mailbox access is wanted remains to be clarified.

The researcher interface no longer asks for an OpenAI API key. Its ChatGPT connection remains unavailable until lookahead receives its own approved hosted OpenAI client and the plan-use integration is completed. The backend retains compatibility with existing API-key connections, but the new interface does not expose key entry.

**ChatGPT subscription-powered simulations are not implemented or enabled yet.** OpenAI's current integration supports eligible plan usage, but remotely hosted applications must request access first. The published local dynamic-registration flow cannot be reused for this Vercel website. Identity-only sign-in never marks the AI connection as ready.

## Configure hosted ChatGPT sign-in

1. Request lookahead's hosted client and **subscription usage** access through [OpenAI's interest form](https://openai.com/form/sign-in-with-chatgpt-interest/). Identity approval alone does not authorize inference using a subscriber's plan.
2. Register these exact callback URLs with OpenAI:
   - Production: `https://health-link-hackathon.vercel.app/api/auth/callback/chatgpt`
   - Local development, if registered: `http://localhost:5173/api/auth/callback/chatgpt`
3. After approval, set server-only `AUTH_OPENAI_ID` to lookahead's issued `oaiapp_…` web client ID and `AUTH_OPENAI_TOKEN_AUTH_METHOD` to the provisioned `none` or `client_secret_basic` method. Confidential clients also require `AUTH_OPENAI_SECRET`. Keep the existing `AUTH_URL` and `AUTH_SECRET`. Never use a Codex client ID, a researcher's local tokens, or `dynamic_agent_client` here.
4. Deploy those settings and verify a live login. The route uses discovered OpenAI endpoints, Auth.js state/PKCE/nonce checks, JWKS signature validation, and first-party encrypted session cookies. Public identity-only clients work without an access token; provider tokens are not retained or exposed to browser JavaScript. Local identities are scoped by verified issuer, client ID, and subject. Matching Google and ChatGPT emails are **not automatically linked**; these are separate sign-in methods/sessions.
5. Before enabling subscription-powered simulations, obtain the hosted client's approved scopes, inference contract, eligible models, and token lifecycle requirements from OpenAI. Implement that approved contract, explicit plan consent, protected credential storage/refresh, usage-limit handling, and **Using ChatGPT plan / Manage usage** UI. The current identity-only integration intentionally requests just `openid profile email` and cannot make plan-funded requests. There is no environment flag that pretends this work is complete and no automatic fallback to separately billed API usage.

No OpenAI hosted registration or client credentials have been obtained, and ChatGPT plan use is not enabled in production. The hosted registration brief is saved at [docs/chatgpt-registration.md](docs/chatgpt-registration.md). It has not been submitted; authorization to submit is pending. The ChatGPT OAuth tests use mocked provider responses.

References: [Website sign-in](https://developers.openai.com/siwc/website), [plan usage availability](https://developers.openai.com/siwc/token-sharing-open-source), [usage UI guidelines](https://developers.openai.com/siwc/ui-ux-guidelines).

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
5. Sign in with Google and enter the workspace. A connected AI provider is not required to explore the demo. The current interface does not provide an API-key entry step.

Never commit secrets or prefix them with `VITE_`. Configure them directly in Vercel or a local ignored `.env`; do not paste them into chat.

Production Google sign-in is now configured in Vercel. `AUTH_URL`, `AUTH_SECRET`, `AUTH_GOOGLE_ID`, and `AUTH_GOOGLE_SECRET` are stored as server-only environment variables, and the app has been redeployed. The live account endpoint reports `configured: true`. Keep the existing production secret rather than rotating it unnecessarily, since rotation signs out current sessions.

The production callback is `https://health-link-hackathon.vercel.app/api/auth/callback/google`. The OAuth audience is currently **Testing**. Because this app requests only `openid email profile`, [Google’s basic sign-in exception](https://support.google.com/cloud/answer/15549945) applies: users do not need to be listed as test users, Testing does not add its warning, and authorizations do not expire after seven days. Adding other scopes would change this behavior. Live Google sign-in was verified on October 3, 2026 with both a Workspace account and a consumer Gmail account: the production site opened Google’s account chooser, requested only name/profile/email access, completed the callback, and displayed the connected researcher. This worked without adding test users. These checks did not grant Gmail mailbox access or make a live OpenAI API request.

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
- The retained API-key backend is for compatibility with existing connections; key entry is absent from the researcher interface. Its submitted credentials are verified server-side, encrypted with a key derived from `AUTH_SECRET`, and stored in an HttpOnly cookie. HTTPS deployments use Secure cookies. The encrypted connection is bound to that researcher and login session, expires with it, and is removed on disconnect or sign-out. The plaintext key is never returned by an API, saved in localStorage, bundled, or logged.
- The retained API-backed run implementation makes three parallel OpenAI Responses requests from fictional research coordinator, participant, and study operations perspectives. It uses `store: false`, a bounded prompt and output, and a 45-second provider timeout. That compatibility path uses separate API billing and has not been tested with live inference. Demo runs do not make these requests; ChatGPT plan-funded requests remain unavailable.
- These outputs are exploratory planning hypotheses, not measured findings, clinical advice, or a validated multi-agent population model. The graph and timeline still use illustrative/local data.
- Only the submitted question is sent. Existing chats and preflight documents are not automatically included. Chat history remains in this browser, is shared by people using the same browser profile, and is not synced to Google or a cloud database. Use separate browser profiles when using different researcher accounts on a shared device.
- Stop cancels the browser request and prevents late results from changing the chat. An upstream request already sent may still finish and incur API usage. Reloading interrupts an AI run; it is never completed using a demo timer.

## Checks

```sh
npm run test:server
npm test --prefix frontend
npm run build --prefix frontend
```

Server tests exercise authentication, request origin checks, encrypted credential binding/expiry, input limits, provider failures, and response handling with mocked network requests. These tests do not themselves verify Google consent or billable OpenAI calls. Google consent and callback were separately verified on the live production site on October 3, 2026, including a consumer Gmail account; live OpenAI calls remain untested.

References: [Auth.js Google setup](https://authjs.dev/getting-started/providers/google), [Google web-server OAuth](https://developers.google.com/identity/protocols/oauth2/web-server), [OpenAI API authentication](https://developers.openai.com/api/reference/overview#authentication).
