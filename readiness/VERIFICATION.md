# Release verification

Verified October 3, 2026 (America/Los_Angeles), on branch `codex/trial-researcher-readiness`.

## Automated checks

- `npm test`: 42 passing tests (22 domain tests, 20 intake/export/storage tests).
- `npm run build`: production Vite build passes.
- `npm audit`: zero reported dependency vulnerabilities at installation.
- Vue component compilation and Git whitespace checks pass.

The tests exercise actual document formats and domain invariants. They include wrong-course evidence, confirmation requirements and invalidation, source changes, unsupported passages, malformed references, dependency cycles, missing prerequisites, forged cached task/policy fields, hypothetical evidence isolation, storage failures, and full project roundtrips.

REST-101 computes 20 working days in the source sequence and 10 with its preparation policy. AURORA-22 computes 18 and 13. A separate test has an independent gate that leaves both plans at 33 days. Calendar arithmetic also handles a 50-task chain spanning 182,500 working days without iterating over each date.

## Browser acceptance

Checked the built application in Chromium using Playwright, including:

| Flow | Observed result |
| --- | --- |
| REST preparation policy | Enabled: 10 days. Disabled: 20 days. Two additional training days: 12 days. |
| Hypothetical evidence | Changes the selected projection; the real evidence register remains unchanged. |
| Exact source inspection | Opens the requirement document with its source line and quote. |
| Verification without evidence | Rejected with the missing requirement code. |
| Matching receipt plus human review | Records verification and updates the satisfied requirement count. |
| Evidence correction | Revokes the affected verification and recomputes readiness. |
| Second fictional packet | AURORA-22 has a distinct 18-day baseline and 13-day preparation scenario. |
| Blank project | Shows evidence needed and no invented readiness date. |
| Fresh mixed packet | Imported a ZIP containing TXT workflow records, DOCX evidence, and a PDF policy. Three documents produced a new six-day plan from their own data. |
| Export | Downloaded real Markdown, JSON, and CSV files. |
| Restore and persistence | Re-imported the JSON, reloaded the page, and retained the project and six-day calculation. |
| Imported baseline assumptions | Preserved as a separate scenario; the source-defined baseline remained 20 days. |
| Altered cached task | Restored as an editable draft with a visible correction error; no readiness date or available actions were granted. |
| Scenario fork | Created a named fork; a three-day review delay produced a 23-day plan. |
| Small screen | At 390px, Overview, Timeline, Scenarios, and Prep packet fit without page overflow; the evidence table scrolls within its container. |
| Dark system preference | The site remains white, with `color-scheme: light`. |
| Navigation and dialogs | Mobile navigation opens/closes; Escape closes a requirement dialog. |
| Print | Generated a PDF from the packet using print styles with source sections expanded. |

Fonts, PDF workers, and parsing libraries are bundled with the site. Document processing requires no external inference or document API.

## Product boundaries

This release is a working local-first readiness workspace. It records human decisions; it does not perform institutional approval or provision real system access. The samples and timing benefits are fictional.

Extraction supports explicit records and a limited set of natural-language requirements. Arbitrary prose remains visible and is flagged for interpretation. Scanned PDFs require OCR outside this application. Dates exclude weekends and do not model holidays or staff capacity.

Projects and profiles are saved in the current browser. JSON export provides portability and backup. There is no shared login, multi-user synchronization, or remote language-model integration in this focused version. The role review is deterministic, source-based assistance.
