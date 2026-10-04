# Research tools

Research tools are an internal Workspace page at `/#/research`. Legacy research, library, and history entry links lead into the same Lookahead app. Appearance changes only the shared color palette; it does not navigate, remount the workspace, or change its storage scope.

## Sources

Import PDF, Markdown, TXT, or ZIP files through the same bounded parser used by simulation setup. The library allows 12 documents and 120,000 extracted characters in total, with a 40,000-character limit per document. Text extraction happens locally. Scanned PDFs require OCR outside the app.

Search ranks keyword matches using the existing lexical retrieval and chunking helpers. It does not download an embedding model. Results display actual extracted-text line ranges, not original PDF page numbers. Select documents to add copies to the active simulation’s setup. Running simulations must be stopped before their setup changes. Removing a library document leaves existing simulation copies and saved review excerpts intact.

## Evidence

A signed-in researcher with a connected OpenAI or Anthropic account can request a review. Demo mode supports local source search but does not make model calls. The review sends:

- The explicit question and active simulation’s saved setup to the selected provider.
- Up to eight matched library passages, with at most three from each document, to the selected provider.
- Search terms to OpenAlex, Europe PMC, and ClinicalTrials.gov through the server.

`/api/evidence` verifies the session and encrypted provider connection, validates any signed university snapshot, bounds retrieval time and response size, and makes one model request. Its output contains claims, disagreements, questions, source excerpts, and retrieval warnings. Citation IDs must exist in the retrieved source pack; otherwise they are removed and the claim is marked uncited. A citation indicates supplied material, not that the claim or study has been independently verified.

Switching accounts or simulations cancels a pending review and prevents late results from being saved to another workspace. Changing appearance keeps the review running. Stopping cancels the request, though a provider may bill work already received.

## Review history

History contains the active workspace’s simulation runs and up to 20 saved evidence reviews. Filter to the current simulation, revisit a cited review, or export JSON/Markdown. Simulation exports identify their study setup as the current saved setup, since earlier runs may have used different source material. Provider credentials and institution verification tokens are excluded from exports.

Sources and reviews use `${simulationStorageKey}:research-tools.v1`; the simulation storage key separates the demo and each signed-in account. These records are local browser data, not encrypted storage or cloud backup. Conflicting edits from another tab block saving and show a reload notice. Legacy Lookahead records are left in their original stores; automatic migration would risk assigning shared browser data to the wrong account. Use **Export earlier workspace data** in Review history to download a filtered JSON archive of old source documents and evidence records. This explicit read-only export excludes provider settings, credentials, and embedding vectors. It does not assign old browser data to the signed-in account.

## Implementation

- `components/ResearchTools.vue`: source, evidence, and history UI.
- `composables/useResearchTools.js`: account-scoped persistence and conflicting-tab protection.
- `lib/researchTools.js`: document validation, keyword retrieval, citations, and exports.
- `server/evidence.js` and `server/handlers.js`: bounded scholarly retrieval and authenticated model review.
- `composables/useWorkspaceTheme.js`, `workspace-theme.css`, and `public/theme-init.js`: shared appearance and first-paint theme restoration.

The old standalone research app, browser-held key flow, study builder, automatic multi-agent debate, semantic model download, cloud backup, and theatrical boot/easter-egg UI are not mounted. The current app has only the short, dismissible Lookahead brand introduction. Some standalone utilities remain in the repository for their existing tests and shared helper implementations.
