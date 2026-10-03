---
name: scope-cut
description: Use when the user is behind schedule, says "what should we cut", "we have N hours left", "triage", or is about to start a big feature late in a hackathon — ranks remaining work by demo impact versus effort and proposes a cut list and a timeboxed plan.
---

# Scope Cut

Hackathons are won by a polished narrow path, not a broad unfinished one.

1. **Ask for the deadline** if not given (time left until submission and until judging).
2. **Inventory.** List open work from the conversation, TODOs (`grep -rn "TODO\|FIXME" frontend/src`), and the user's stated wishlist.
3. **Score each item** on demo impact (does a judge see it in 3 minutes?) and effort (S under 30 min, M 1–2 h, L more than 2 h), and note risk (new dependency, backend, auth, external API).
4. **Recommend**, as a table:
   - **Do now**: high impact, S or M, on the golden path
   - **Fake it**: high impact but L or risky → mock data, a static stand-in, or a clearly labeled "preview"
   - **Cut**: low impact, or anything off the demo path
5. **Timebox.** Turn "do now" into a schedule with buffers: stop features at T-90 min, then polish, record the backup video, and write the submission (see the `demo-ready` and `devpost-writeup` skills).
6. Never silently drop something the user asked for. Present the cut list and let them decide.
