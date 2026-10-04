# microfish — DESIGN.md

Merges two sources:
- **Accents (portfolio):** `awesome-design/design-md/rauno`, plus the mykm.dev voice you described: lowercase, mono labels, split-letter boot, ⮡ glyphs.
- **Core (AI tool):** `awesome-design-md/design-md/claude`, with its warm neutrals and coral primary, scaled down from marketing to a calm, dense app UI.

Rule of thumb: **the portfolio voice lives in labels, transitions and empty states. The chat, sidebar and split view stay quiet and dense.** Never let accent motion compete with reading a transcript.

## 1. Atmosphere
A craftsperson's notebook that happens to run simulations. Dark-first, warm near-black (not cold blue-grey), hairline borders instead of shadows, one coral accent. Text is lowercase and terse. Numbers, ids, timestamps and statuses are mono. Light theme follows `prefers-color-scheme` with the same tokens inverted.

## 2. Color tokens
| Token | Dark | Light | Role |
|---|---|---|---|
| `--canvas` | `#12110f` | `#faf9f5` | app background |
| `--surface` | `#181715` | `#f5f0e8` | sidebar, panels |
| `--surface-raised` | `#1f1e1b` | `#efe9de` | cards, composer, menus |
| `--surface-hover` | `#252320` | `#e8e0d2` | row hover / selected |
| `--hairline` | `#2a2825` | `#e6dfd8` | 1px dividers, card borders |
| `--ink` | `#faf9f5` | `#141413` | primary text |
| `--body` | `#c9c6bf` | `#3d3d3a` | transcript text |
| `--muted` | `#8e8b82` | `#6c6a64` | secondary copy |
| `--faint` | `#5f5c55` | `#8e8b82` | mono metadata |
| `--accent` | `#cc785c` | `#cc785c` | primary action, focus ring, running pulse |
| `--accent-press` | `#a9583e` | `#a9583e` | active state |
| `--teal` | `#5db8a6` | `#3f9886` | agent nodes: done / positive |
| `--amber` | `#e8a55a` | `#b9792a` | agent nodes: pending / caution |
| `--danger` | `#c64545` | `#c64545` | stop, delete |

Status mapping: idle = `--faint`, running = `--accent` (pulsing), done = `--teal`, stopped = `--muted` (faded).

## 3. Typography
- **Sans:** Geist (fallback Inter). All UI and transcript text.
- **Mono:** Geist Mono (fallback JetBrains Mono). Labels, metadata, counters, view switcher, timestamps, code.
- **Voice:** lowercase everywhere in chrome: `new simulation`, `search`, `running · 3 agents`. Sentence case only inside user and model message bodies. Brand is `microfish.` with the period in `--accent`.

| Role | Font | Size / line | Weight | Tracking |
|---|---|---|---|---|
| boot / empty-state title | Geist | 32–40 / 1.1 | 500 | -0.02em |
| view title | Geist | 18 / 1.3 | 500 | -0.01em |
| body, messages | Geist | 14.5 / 1.65 | 400 | 0 |
| sidebar row | Geist | 13.5 / 1.4 | 450 | 0 |
| mono label | Geist Mono | 11–12 / 1.5 | 400 | +0.02em, lowercase |

Density: this is an app, so body is 14.5px and the transcript column is up to **720px** wide (Rauno's 680 plus room for tables and code).

## 4. Layout and spacing
- 4px base: `4 8 12 16 24 32 48`.
- Shell: sidebar **264px** | main. Sidebar collapses to an off-canvas sheet below 768px.
- Chat view: single column, 720px max, composer pinned bottom.
- Split view: chat 45% | graph 55%, with a draggable 1px divider (hit area 8px).
- Radii: 6px controls, 8px cards and rows, 12px composer and dialogs, pill for status badges.
- Breakpoints 640 / 768 / 1024. Touch targets ≥ 40px on touch devices; desktop rows are 32px for density.

## 5. Elevation
No shadows in-app. Depth = surface step + hairline (`canvas → surface → surface-raised`). The only shadow is on dialogs and menus: `0 24px 48px rgba(0,0,0,.5)` in dark, `0 12px 32px rgba(20,20,19,.12)` in light. Hover is a surface step, never a layout shift.

## 6. Components (shadcn-vue / Reka UI, restyled by these tokens)
- **Sidebar:** `surface` fill, hairline right edge. Top: `microfish.` wordmark + collapse. Then `new simulation` (ghost button, mono hint `⌘K`). Then search input (command-palette style, filters live). Then a mono section label `chats` and rows: 32px, title + mono status `● running · 2 runs`. Row menu is a dropdown (rename, delete). Rename and delete confirm via dialog. Footer: mono `local demo` badge and a workspace identity.
- **Buttons:** primary = `--accent` fill, white text, 32px, 8px radius. Secondary = `surface-raised` + hairline. Ghost = text only; hover shows a dotted underline that animates in. Destructive = `--danger` text on ghost, filled only inside the confirm dialog.
- **Links:** prefixed with `⮡` in mono, `--muted`. On hover the glyph shifts 2px right/down and the text goes `--ink`. Used for: follow-up suggestions, "open in graph", docs, source links.
- **Composer:** `surface-raised`, hairline, 12px radius, autosizing textarea, mono hint row below (`enter to run · shift+enter for newline`). Send is a 32px accent icon button. While running it becomes `stop` (danger ghost).
- **Message blocks:** no bubbles. User = `--ink`, right-aligned mono label `you`. Model/run output = `--body`, left, with a mono run header `run 02 · 24s · 12 agents`. Hairline between runs.
- **Status signature** (`StatusBadge`, modeled on Vercel's deployment states): 8px dot with a soft 3px halo in the state's tone, sans 12.5px label, then mono metadata separated by faint middots, e.g. `● running · 42% · 8s`, `● ready · 24s · 12 agents`, `● stopped · at 61% · 14s`. Running ripples the halo outward (no blinking). Draft is a hollow ring. Tones: running = accent, ready = teal, stopped = muted, blocked = danger. Chip variant (hairline border, `surface` fill) for the topbar and graph header; small variant in sidebar rows.
- **Sample rack (loading):** while a run is active, five sample tubes fill in sequence with progress in the muted `--kg-*` colors, with bubbles in the active tube. A small coral "sus" microfish (an original character) peeks over the rack every 3.5–9s, glances around and ducks back. There's no peeking under reduced motion.
- **View switcher** (chat / graph / split): mono segmented control, lowercase, 28px, active = `surface-hover` + `--ink`.
- **Dialogs and menus:** `surface-raised`, hairline, 12px radius, 150ms fade+scale(.98→1).
- **Toasts and notices** (storage warning, capacity): hairline box, mono prefix `note —`, `--amber` for warnings.
- **Focus:** 2px `--accent` ring at 2px offset, always visible on keyboard focus.

## 6b. Researcher surfaces
- **Mode chip** (topbar, chip `StatusBadge`): `demo · 12 agents` or `openai · <model>`. It opens **model & data**.
- **model & data dialog:** mode segmented control; key field (password, show/hide, verify with status badge, "remember for this tab only"); model select populated from the key's models; temperature/seed; a plain-language "where your data goes" list; record count and storage persistence; export all (csv/json); two-step "delete all local data".
- **Analysis panel** (under each run): status badge (`analyzing` → `analysis ready · 0.9s · model` / `out of scope` / `analysis failed` with retry); summary strip (supportive/neutral/opposed counts, mean /4); a dense stakeholder table (category dot, 5-step stance scale, label, confidence, expandable "why"); assumptions and caveats; an honesty note; a collapsible mono provenance list with the record fingerprint and copy; actions: re-run fresh, csv, json. Demo runs show a one-line "record saved" strip.

## 6c. Tool pages (study build, document preflight, start-up timeline)
- Shared layout: `.tool-page` with a mono eyebrow (the Track 2 area it serves), a 26px lowercase title, a one-sentence lede saying the specific outcome, a metric strip (`.metric`: mono label, 22px value, small status badge), then `.panel` cards. Exports (csv/json/md) are `.mini-btn`s in the panel head. A mono scope line at the bottom states the method's limits.
- **Study build:** protocol textarea → schedule-of-activities matrix (site-tone dots, per-visit participant-minute bars with the heaviest visit in accent), edit checks in a disclosure, and a source-check area: extracted-values table plus query cards with a left severity border (danger high, accent medium) and the exact source line. "rehearse this burden" opens a stakeholder rehearsal pre-filled with the burden summary.
- **Preflight:** document list and editor | findings with category filters, severity badges, "reviewed" toggles and expandable sources that jump to the document.
- **Timeline:** plan toggle; Gantt rows (owner initials, critical bars in accent, slack hatched, baseline dashed, added delay striped) and a red target line; the detail panel has a 0–15 day delay slider with a one-line consequence ("pushes first participant in by 5 days — past target").
- Welcome screen: a `beta` pill, the line "rehearse the trial before it reaches your sites.", trial starter prompts, and tool cards. No invented metrics, logos or testimonials.

## 6d. Evidence panel
- Sits under the analysis panel for in-scope your-key runs. While running: a `deliberating` badge plus a mono stepper (plan → scholarly search → web (secondary) → opening positions → rebuttals → consensus), with ○ pending, ◐ current in accent, and ● done in teal.
- Tabs: **consensus** (recommendation chip, the decision sentence, the panel estimate beside the *computed* cross-check, the calculation in `.code-text`, key points with `S#` citation chips, dissent, evidence gaps, citation-audit line); **debate** (per agent: opening → final estimate, claims with strength, rebuttal responses as agree/partly/disagree badges, revised position); **provenance** (numbered pipeline of queries, database log with links, web filtering with excluded links, and the evidence pack where each source shows its link, metadata, credibility badge with an expandable "why", relevance, and who cited it).
- Citation chips use site-tone outlines and never lowercase their ids. Clicking one switches to provenance and highlights the source with an accent ring. "uncited" chips use amber.

## 7. Graph view: knowledge graph (Vue Flow + d3-force)
- Canvas `--canvas` with a faint dot grid. Layout comes from d3-force (link, charge, collide, center). Dragging a node pins it while neighbors follow, and on release it settles back.
- **Category colors** (muted and warm-leaning, never brighter than the accent; separate light/dark values): `--kg-core` coral (the protocol change), `--kg-participant` sage, `--kg-site` slate blue, `--kg-oversight` ochre, `--kg-sponsor` taupe, `--kg-data` mauve. Coral as an *activity* signal belongs only to running state.
- **Search and fullscreen:** a mono "find stakeholder" field highlights the first match (Enter inspects, Esc clears). A fullscreen control sits under zoom/fit.
- **Node:** circle sized by degree (r = 9 + 2.2 × links), 1.5px category ring, fill = category at 22% over canvas. Label below in Geist 11.5. On hover a mono meta line appears (`provider · 4 links`).
  - *idle* (not reached by the run): dashed ghost ring, faint label.
  - *running:* full category fill plus a coral ring pulsing outward (1.8s, staggered).
  - *done:* full category fill, static.
  - *stopped:* fades to 45% over 400ms.
- **Edges:** straight, 1px `--kg-edge`. Edges between reached nodes get stronger, and while running they show a slow coral dash flow. Relation labels ("reports to", "bills") appear in mono only on the focused node's edges.
- **Interaction:** hover highlights the neighborhood and dims the rest to 18%. Click selects, centers the view and opens a detail panel listing relations (each one jumps to that agent). Legend chips filter categories. Zoom in/out/fit controls sit top-right. The graph re-fits on pane resize.
- **Stance mode:** when an OpenAI analysis exists for a run, a `category | stance` toggle appears. Stance colors run opposed (`--stance-opposed`, dusty rose) → neutral (warm grey) → supportive (sage), mixed in oklab. The detail panel shows the likely stance, score/4 and confidence.
- Labelled honestly: the footer keeps `illustrative topology — not model output`, or `stances estimated by <model> — verify before use`.

## 8. Motion
Principle: quick and purposeful, transform and opacity only. Easing `cubic-bezier(.2,.7,.2,1)`; durations 120ms (hover), 200ms (UI), 400–700ms (page-level). Everything respects `prefers-reduced-motion` (disable pulses, split-letter boot, parallax; keep opacity fades).
- **Boot screen** (first load per session only): `microfish.` rendered as split letters; each letter rises 12px and fades in, 40ms stagger (GSAP), holds ~300ms, then the shell fades up. Skipped on reload within the session and when reduced motion is on. Never blocks interaction for more than ~1.2s.
- **Empty state:** the welcome title uses a text animation (Vue Bits / Inspira UI, e.g. blur-in or text-reveal) over a subtle animated background (dot grid or aurora, very low contrast, paused when the tab is hidden). Starter prompts are `⮡`-prefixed mono-label cards that stagger in.
- **Smooth scroll:** Lenis on the message list and sidebar list only. Do not hijack page scroll, and disable under reduced motion.
- **Messages:** new run blocks fade/translate in 8px (200ms). Streaming demo text never animates per character in the transcript. Text animation stays out of the reading surface.
- **Sidebar rows:** on create/delete, height + opacity transition 200ms.

## 9. Copy voice
- lowercase chrome, no exclamation marks, no emoji.
- Labels read like a changelog: `new simulation`, `12 agents · demo`, `stopped — 8 of 12 agents finished`.
- Empty search: `nothing matches "x"`.
- Em-dash separators in metadata: `run 02 — 24s — demo`.

## 10. Do / Don't
**Do:** keep one accent; use mono for anything machine-like; let hairlines do the structure; animate state changes, not decoration; keep transcript contrast ≥ 4.5:1 in both themes.
**Don't:** use shadows or gradients in the app chrome; use bubbles; animate the transcript text; use a hero layout or big CTAs; introduce a second accent; ship motion that ignores reduced-motion.

## 11. Implementation notes
- Tokens live as CSS variables on `:root` / `[data-theme]` in `src/style.css`, mapped into shadcn-vue's expected variables (`--background`, `--foreground`, `--primary`, `--border`, `--ring`, …).
- Do not modify `src/lib/simulationWorkspace.js` or `src/composables/useSimulationWorkspace.js`. All redesign work happens in components and CSS; existing tests must still pass.
- Libraries: shadcn-vue (Reka UI), `@vue-flow/core`, Vue Bits or Inspira UI components copied into `src/components/fx/`, `gsap`, `lenis`.
