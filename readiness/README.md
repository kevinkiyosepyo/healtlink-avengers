# Trial Researcher

Trial Researcher turns a trial-team member’s onboarding packet into a source-linked readiness plan. It connects requirements, evidence, human review, dependencies, owners, and next actions in one workspace.

This is a separate application in the `readiness/` directory, developed on `codex/trial-researcher-readiness`. The original clinical-trial rehearsal application remains in `frontend/` and uses its existing deployment.

## Run locally

Requires Node.js 22.12 or later.

```sh
cd readiness
npm ci
npm run dev
```

```sh
npm test
npm run build
npm run preview
```

## What the workspace does

- Opens with a fictional REST-101 onboarding packet for Alex Chen.
- Supports a second fictional biospecimen onboarding packet, AURORA-22, and blank projects.
- Keeps the source text, the extracted requirement, and the exact source line together.
- Distinguishes evidence received, evidence verified, permission approved, and access active.
- Requires matching evidence and a human review note before recording verification, approval, or active access.
- Revokes a recorded confirmation when its underlying source or evidence changes.
- Calculates a working-day dependency schedule from the current project, including critical tasks and slack.
- Compares the current sequence with source-supported parallel preparation, hypothetical evidence assumptions, and additional task delays.
- Keeps hypothetical scenarios separate from actual evidence states.
- Shows available and blocked next actions with owners and source references.
- Provides a structured review of missing evidence, permissions, and access boundaries.
- Imports text, Markdown, PDF, DOCX, and ZIP packets into the browser.
- Exports a human-readable Markdown packet, a preparation packet CSV, and a complete JSON project for restoration.
- Saves work locally in the current browser.

## The demonstration

1. Open Alex’s REST-101 project.
2. Inspect the protocol-specific training requirement. The general GCP certificate covers a different course; it does not verify REST-101 training.
3. Open its exact requirement passage and the received certificate.
4. Inspect the parallel preparation policy. It permits preparation of paperwork and an account request while training is pending; authorization and activation retain their prerequisites.
5. Compare Current plan and Parallel preparation. The sample’s source-defined durations produce a 20-working-day current plan and a 10-working-day parallel plan.
6. Add a delay or change the source policy and see the schedule recompute.
7. Add matching evidence, record a human verification, and inspect the updated actions.
8. Export the packet for the coordinator or switch to AURORA-22 to exercise a different graph.

All people, institutions, documents, policies, durations, and decisions in the samples are fictional. The duration difference is a result of these constructed assumptions, not a measured operational benefit. A displayed projection does not itself grant permission or activate an account.

## Sources and extraction

The parser is deterministic. It extracts supported statements, preserves the source text, and flags passages that need human modeling. It does not infer arbitrary institutional policy or use a remote language model. Uploaded files are converted to text locally; scanned PDFs without a text layer need a text transcription.

The explicit packet format is useful for documenting a coordinator’s corrections. Each statement occupies one line:

```text
Requirement | id=training | title=Protocol-specific training | code=STUDY-TRAINING | kind=training | owner=Researcher | state=verified
Requirement | id=authorization | title=PI delegation approval | code=STUDY-APPROVAL | kind=approval | owner=Principal investigator | state=approved
Task | id=course | title=Complete study training | owner=Researcher | days=3 | after= | requires=training | completes=training | state=received
Task | id=review | title=Verify course evidence | owner=Coordinator | days=1 | after=course | requires=training | completes=training | state=verified
Task | id=approval | title=Approve delegated duties | owner=Principal investigator | days=2 | after=review | requires=authorization | completes=authorization | state=approved
Evidence | code=STUDY-TRAINING | state=received | title=Protocol-specific training completion certificate
```

`Requirement.state` describes the required completion state. It does not assert that the person has attained that state. An evidence statement records a received document; verification remains a separate human action.

Dependencies reference task IDs. Requirement links reference requirement IDs. Evidence is matched to the explicit requirement code. A policy can authorize preparation tasks to begin independently:

```text
Policy | id=parallel-prep | title=Prepare empty templates during training | parallel=prepare-templates | description=Empty templates may be prepared while training is pending; use with research data requires separate authorization.
```

The named task must exist. Only source-backed dependency overrides are applied. Inspect findings after extraction, correct the source or requirement, and review the resulting model before relying on its plan.

## Scheduling semantics

Durations are elapsed working days, Monday through Friday. A Monday start plus five working days finishes on the following Monday. Holidays, part-time calendars, resource capacity, queue variability, and institutional operating hours are not modeled.

The engine validates the dependency graph and reports unknown dependencies and cycles. It derives earliest starts, finish dates, the critical path, and slack. Additional scenario delays add working days to named tasks. A scenario’s assumed evidence affects its projection without changing the actual evidence record or actual action availability.

Changing a scenario does not change the source-defined current plan. Removing a source policy removes its authority to change dependencies. An empty project has no readiness date until it has a valid model and a start date.

## Data and privacy

Documents, project data, and local profile information are held in browser storage. No uploaded document is sent to an API or hosted database by this application. There is no shared account or cross-device synchronization. Download a JSON export to transfer or back up a project; clearing browser data removes locally saved work.

The site loads its application and parser assets from its own origin. No API key is needed. The review panel is rule-based assistance, not independent expert assessment, institutional approval, or a validated prediction.

## Code map

| File | Responsibility |
| --- | --- |
| `src/App.vue` | Workspace, evidence editing, scenarios, sources, exports, and profile |
| `src/components/AppModal.vue` | Accessible modal behavior |
| `src/style.css`, `src/responsive.css` | White interface, responsive layouts, readable type, and print styling |
| `src/lib/readiness.js` | Extraction, validation, human confirmation, scheduling, and review |
| `src/lib/sampleCases.js` | Two source-defined fictional packets and blank project |
| `src/lib/fileIO.js` | Local packet parsing and portable exports |
| `src/lib/storage.js` | Browser persistence and error handling |
| `tests/` | Domain, import/export, and persistence checks |
| `ENGINE_CONTRACT.md` | Integration schema and function return values |

## Deployment

Deploy from the `readiness/` directory to the separate Vercel project `trial-researcher-ready` in scope `k-4b60`. The standalone configuration builds a static Vite application and serves parser workers from the same origin. The original `health-link-hackathon` deployment is unrelated to this directory.

```sh
vercel link --project trial-researcher-ready --scope k-4b60 --yes
vercel deploy --prod --scope k-4b60 --yes
```

The branch can be merged later without replacing the old app: the two application roots and deployment projects are separate.

See `VERIFICATION.md` for the completed acceptance checks and the boundaries of this release.
