# October 4, 2026 integration record

This record reconciles work from the project chats into the existing Lookahead repository. It records feature provenance and the verified integration checks below. Git history records the release commit, and production deployment is verified afterward. The tests do not establish paid AI-service behavior.

## Integrated architecture

There is one Vue app, one simulation controller, and one account-scoped set of tools. Both HTML entrypoints open that app; `/research.html` remains a compatible bookmark. Light/dark appearance changes colors without replacing the app, changing accounts, or stopping active work. Visible branding is Lookahead; older `microfish` storage and authentication identifiers remain stable.

| Work source | Release scope |
| --- | --- |
| MAIN | Concurrent simulation chats, centered study setup, PDF/Markdown/TXT/ZIP intake, editable dictation, personal-only university onboarding, and the initial sample graph. The release unifies the app and adds internal Sources/Evidence/Review history, compatible older links, and explicit export of earlier local records. |
| #1 (light dark mode) | The requested appearance control and 300 scripted sample perspectives from 60 roles and five lenses. Its earlier toggle between separate apps is superseded by MAIN's shared app, controller, and theme state. |
| MATTHEW KIM | Gist and law-app video research; no authentication or website feature changes attributed to this chat. |
| Add university-specific IRB agents | Audited official rosters/policies, evidence-checked profiles, labeled composites, public preview, and automatic signed personal context through either provider. Also Lookahead branding, the dismissible 1.35-second introduction, and removal of the university-preview action from login; the preview belongs below Document preflight. |
| Summarize AI website design signs | OpenAI/Anthropic connections and provider fixes, inference-based connection checks, actionable errors, preservation of confirmed account state during temporary refresh failures, and the **Predict the Future** login headline. |
| SAMPLE CALSE | Expanded REST-101 explanation, fictional intake packet, and preflight ZIP imports. The public case document omits personal correspondence, private affiliations, and links to private planning documents. |
| Latest main cleanup | Cloud backup remains removed. Local research data is not uploaded to a cloud store. |

Public member names are used only when the retrieved source supports an IRB membership role. Their generated perspectives do not represent those people's opinions or institutional decisions. The public preview uses scripted sample questions; a personal AI run uses the connected provider and a session-bound signed snapshot.

## Sample graph and packet imports

The sample graph contains **300 fictional agent perspectives**, formed from 60 roles and five review lenses, including explicit IRB roles. Its 309 graph nodes include nine case-evidence nodes. Activity playback is scripted locally; opening it does not make 300 model requests. Focused graph tests and a browser check verified the expanded population and an IRB entry.

Document preflight accepts text and Markdown files directly or inside ZIPs. The fictional packet ZIP was browser-tested with nine Markdown documents. Archive extraction enforces document, character, and byte limits and reports file-level errors. An invalid archive leaves the existing packet intact. PDF study materials belong in New simulation or Research tools; preflight does not parse PDFs inside ZIPs.

The simulation-setup and Research tools ZIP parser is shared with preflight, but each flow keeps its own supported formats and limits. One flow's successful import does not establish that another accepts the same document type.

## Deliberately separate work

**Trial Researcher readiness** remains on `codex/trial-researcher-readiness`, deployed separately at [trial-researcher-ready.vercel.app](https://trial-researcher-ready.vercel.app). Its source-linked requirements, evidence verification/access gates, dependency engine, DOCX imports, scenarios, and exports are not silently merged into this app. The later voice-dictation request for that separate site was interrupted; this release makes no claim that it was completed.

The upstream MiroFish report/graph and English-language changes belong to another checkout and the separate `mirofish-medtech-team.vercel.app` deployment. They are not Lookahead features.

XGBoost, judge background research, Track 2 idea lists, and RunHarbor analysis are research or recommendations, not additional accepted application features. The original `HACKATHON_PROJECT_STATE.md` and `judge-background-research.md` remain reference deliverables outside this website release. The historical project-state report should not override newer code or release decisions. Private dossier and personal-concept documents are not copied into this release from the original checkout.

## Verification and publication

The integrated automated run passed **343 tests: 104 server, 233 frontend, and six Express tests**, and the production build passed. The graph changes also passed 21 focused tests. Browser checks verified the 309-node/300-perspective sample, an IRB entry, and the nine-document Markdown ZIP in preflight. Documentation links and whitespace checks passed.

- Release commit is recorded in Git history.
- Target production URL: [health-link-hackathon.vercel.app](https://health-link-hackathon.vercel.app/).

Deployment verification follows the release commit. The build and local checks above do not establish that this revision is already deployed or verified at the production URL.

Provider tests use mocked API responses. No paid OpenAI or Anthropic call is implied by these passes. Public-source retrieval and existing Google OAuth checks are separate from paid model verification. The sample graph and its activity feed are scripted; the two-week REST-101 comparison follows invented scheduling assumptions.
