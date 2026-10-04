---
name: demo-ready
description: Use when the user says "demo ready", "prep the demo", "judging soon", or asks to get the project ready to present — verifies the build, rehearses the golden path in the browser, writes a timed demo script, and lists fallbacks.
---

# Demo Ready

Goal: the 3-minute demo path works every time, and there is a plan B when it doesn't.

1. **Green build.** `cd frontend && npm test && npm run build`. Fix failures before anything else; report what you changed.
2. **Golden path.** Identify the single flow judges must see (for lookahead: new simulation → starter prompt → run → split view with the knowledge graph pulsing → hover/click an agent → stop). Run it in the browser (claude-in-chrome) from a clean state: clear localStorage and sessionStorage, reload, and walk it end to end. Check the console for errors. Record a GIF of the flow as a backup.
3. **Kill demo risks.** Look for: network calls that can fail on venue Wi-Fi, first-load delays, empty states that look broken, text overflow at projector resolutions (1280×720 and 1920×1080), dark-mode-only contrast issues, debug UI, `console.log` noise. Fix the cheap ones; list the rest.
4. **Seed data.** If the demo needs pre-made content, add a seeded state the presenter can load deliberately (never silently in production paths).
5. **Script.** Write `DEMO.md` at the repo root:
   - one-line hook (problem → who has it → why now)
   - timed beats: 0:00 hook, 0:20 problem, 0:40 live demo (each click listed), 2:20 how it works (1 sentence of tech), 2:40 impact / what's next
   - the exact prompt text to type or paste
   - plan B: the GIF path, and what to say if the live demo fails
6. **Report** the checklist with pass/fail, plus anything the presenter must do by hand (e.g. close other tabs, zoom the browser to 110%).
