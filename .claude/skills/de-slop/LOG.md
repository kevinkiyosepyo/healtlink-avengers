# De-slop log

Recurring corrections in this repo. Read before running the skill; add one line per new pattern.

- 2026-10-03 · duplicated tool-page CSS (`.panel`, `.mini-btn`, `.field`, …) across three pages → shared `.tool-*` / `.btn-*` classes in `style.css`.
- 2026-10-03 · stance color function written twice (graph and analysis panel) → `stanceColor()` in `lib/agents.js`.
- 2026-10-03 · localStorage read/write try/catch repeated per component → `lib/storage.js`.
- 2026-10-03 · async components each needing an error state → one `lazy()` helper in `App.vue`.
- 2026-10-03 · divergent workspace entrypoints shared incompatible graph/style files → keep their page components and styles separate, share compatible state/API helpers, and verify both routes.
- 2026-10-04 · appearance controls navigated between separate applications → keep one workspace and shared theme tokens; verify graph selection, playback, and draft inputs survive the switch.
- 2026-10-04 · every unfinished provider answer became a shorter-question error → classify output limits, retry only the affected reviewer with all source context, and bound the whole run.
- 2026-10-04 · a fixed university panel consumed chat space → collapse it per chat by default and place expanded details in the message scroll area, keeping the composer available.
- 2026-10-04 · model JSON enforced review shape but allowed duplicate agents and invented source IDs → require exact agent keys and document ID enums, then retry invalid batches with the original context.
