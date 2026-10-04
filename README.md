# Lookahead

Lookahead helps researchers prepare a study, inspect its dependencies, and explore possible reviewer questions. The login page leads with **Predict the Future**; the outputs are planning scenarios, not validated forecasts or institutional decisions.

One workspace serves both light and dark appearances. Theme changes preserve navigation, chats, drafts, provider connections, and active runs. The older `/research.html` link opens this same app. A brief, dismissible 1.35-second introduction appears once per browser session and respects reduced motion.

- **Sample case:** an interactive REST-101 knowledge graph with 300 fictional agents: 60 roles viewed through five review lenses, including IRB perspectives. Its walkthrough is scripted local playback. No sign-in or university onboarding is required.
- **Your research:** Google sign-in, university selection, and optional OpenAI or Anthropic connections stored in encrypted, session-bound server cookies.
- **New simulation:** a centered dialog for study context, PDF/Markdown/TXT/ZIP imports, and editable voice dictation. Multiple simulation chats can run concurrently.
- **University IRB preview:** a Workspace entry below Document preflight. It checks audited public university sources and offers clearly labeled scripted example questions without an account or API key.
- **Document preflight:** text and Markdown packets, including ZIP imports, checked locally for missing fields, conflicting instructions, outdated versions, and unresolved questions.
- **Research tools:** local Sources, explicit cited Evidence reviews, and Review history, alongside the bottleneck timeline.

## Run and verify

Use Node.js 22 or later.

```sh
npm run install:all
npm run dev
npm test
npm run build
npm start
```

Vite development, Express hosting, and Vercel use the same API handlers. Follow [AUTH_SETUP.md](AUTH_SETUP.md) for Google callbacks and server settings. An unconfigured development environment still supports the sample case.

## Data and limits

Study documents are parsed locally. Explicit simulations and evidence reviews send the selected study context and relevant passages to the connected provider. University lookup uses official public sources; if model-assisted discovery is needed, it uses a connected OpenAI or Anthropic account. Names and roles require source evidence, and unavailable rosters produce labeled composite reviewers. A personal AI simulation attaches a fresh server-signed university snapshot before it starts.

Research tools retrieve scholarly results from OpenAlex, Europe PMC, and ClinicalTrials.gov. Source excerpts are visible; invalid citation IDs are removed and uncited claims are marked. Citations do not establish that generated claims are correct.

Demo and personal account records are stored separately in this browser. There is no cloud backup. Internal `microfish` storage and authentication identifiers remain unchanged to preserve existing data and sessions. Legacy research records are not automatically assigned to a Google account; Research tools offers an explicit export.

See [simulation behavior](docs/microfish-workspace.md), [research tools and data flow](docs/research-workspace.md), the [fictional sample case](Trial-Researcher-Onboarding-Case-Study.md), and the [October 4 integration record](docs/release-integration-2026-10-04.md). The integration record lists feature provenance and verification boundaries.
