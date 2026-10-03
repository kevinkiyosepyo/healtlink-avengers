# De-slop log

Recurring corrections in this repo. Read before running the skill; add one line per new pattern.

- 2026-10-03 · duplicated tool-page CSS (`.panel`, `.mini-btn`, `.field`, …) across three pages → shared `.tool-*` / `.btn-*` classes in `style.css`.
- 2026-10-03 · stance color function written twice (graph and analysis panel) → `stanceColor()` in `lib/agents.js`.
- 2026-10-03 · localStorage read/write try/catch repeated per component → `lib/storage.js`.
- 2026-10-03 · async components each needing an error state → one `lazy()` helper in `App.vue`.
