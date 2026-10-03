# Microfish: hosted ChatGPT connection request

Prepared October 3, 2026. Draft only; no registration or interest-form submission has been made.

## Interest form

Use [OpenAI’s Sign in with ChatGPT interest form](https://openai.com/form/sign-in-with-chatgpt-interest/).

| Field | Proposed value |
| --- | --- |
| Product | Microfish, a HealthLink hackathon research-planning prototype |
| Website | https://health-link-hackathon.vercel.app |
| Requested capability | Sign in and ChatGPT plan use for AI requests |
| Applicant/contact | To be supplied by the applicant |
| Company/legal entity | Not supplied; Microfish is the current product name |
| Job title | Not supplied; optional on the form |

### Product description for the form

Microfish is a hosted research-planning prototype for researchers to explore “what if” scenarios. The website includes an interactive bottleneck timeline that shows tasks, owners, prerequisites, and how delays affect downstream work. Its scenario exploration considers three fictional perspectives: research coordinator, participant, and study operations. The generated analysis is intended to help researchers identify assumptions, possible bottlenecks, and practical next steps; it is not empirical research evidence or a validated prediction.

We want researchers to sign in to Microfish with their Google account and then separately connect ChatGPT, with explicit permission to use their eligible ChatGPT plan for scenario requests. Researchers should not need to create or paste an OpenAI API key. Google identifies the researcher; the ChatGPT connection supplies the requested AI authorization. We are requesting hosted-application access for both the OAuth connection and ChatGPT plan use for AI requests.

## Technical registration details

- Application: a Vue/Vite website with a server-side OAuth handler hosted on Vercel.
- Production origin: `https://health-link-hackathon.vercel.app`
- Requested production callback: `https://health-link-hackathon.vercel.app/api/auth/callback/chatgpt`
- Intended flow: Google sign-in → explicit separate ChatGPT connection → ChatGPT permission/plan selection → return to the same Microfish researcher session → run scenario exploration.
- Intended inference: three perspective requests for each user-submitted scenario, using eligible models and the hosted contract approved by OpenAI.
- Requested client: Microfish’s own hosted OAuth client, with the registered token-endpoint authentication method and any required confidential-client secret supplied securely by OpenAI.

Please confirm the approved plan-use scopes/resource, model catalog, inference and streaming requirements, refresh/revocation contract, and applicable usage-limit behavior for this hosted client. Identity approval alone would not meet the requested simulation capability.

## Current implementation and remaining work

Google sign-in has been verified on the production site. The repository also has an identity-only ChatGPT OAuth handler using OpenID Connect, PKCE, state, nonce, and signature validation, but it has no approved hosted client configured. It requests only identity scopes and does not retain an inference token or enable ChatGPT plan use.

After hosted access is approved, the app still needs the separate researcher-to-ChatGPT connection flow, secure provider-token storage and refresh/revocation, verification of granted plan permission, account-eligible model selection, streaming inference through completion, usage-limit handling, and visible plan/usage controls. Matching email addresses will not serve as proof that accounts should be linked.

No live ChatGPT OAuth or ChatGPT-plan inference has been verified. This draft makes no claims about organizational affiliation, incorporation, user count, privacy certification, or compliance status.

## Access boundary and sources

OpenAI currently describes website sign-in as a limited partner trial. Its [client-registration page](https://developers.openai.com/siwc/request-client-id) directs applicants to the interest form. Its [ChatGPT plan-use overview](https://developers.openai.com/siwc/token-sharing-open-source) directs remotely hosted applications to that same form.

The public dynamic-registration instructions are for local/open-source clients and require a loopback callback; they are not a registration method for this hosted Vercel website. See [registration and sign-in](https://developers.openai.com/siwc/token-sharing-open-source/sign-in). The identity-only hosted flow is documented in [On your website](https://developers.openai.com/siwc/website). The approved hosted contract must govern the final implementation.
