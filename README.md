# Research simulation workspaces

This repository serves two existing workspaces from one build:

- **Microfish** at `/`: researcher sign-in and university selection, document and voice intake, saved simulation chats, and the interactive REST-101 sample with 60 fictional agents at `/#/case`.
- **Lookahead** at `/research.html`: clinical-trial stakeholder rehearsal, evidence deliberation, source library, study build, preflight, start-up timeline, and optional cloud backup.

Each workspace links to the other. Their existing browser storage keys are preserved. The Microfish sample uses a scripted local walkthrough; it does not make 60 model calls. University onboarding applies only to Microfish's personal research entry, never the sample.

## Run and verify

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
