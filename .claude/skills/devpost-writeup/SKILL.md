---
name: devpost-writeup
description: Use when the user asks for a Devpost / hackathon submission, project write-up, or "what do we submit" — drafts every standard submission section from the actual code, git history, and README, written in the team's voice.
---

# Devpost Write-up

Write from evidence, not hype. Every claim must be traceable to code, commits, or the user.

1. **Gather.** Read `README.md`, `DESIGN.md`, `DEMO.md` if present, `package.json` deps, and `git log --oneline` for the whole project. Skim the main components to see what is real versus mocked.
2. **Be honest about the demo.** If parts are simulated or illustrative (lookahead runs are local demos; the graph is an illustrative topology), say so plainly. Judges punish overclaiming more than they punish scope.
3. **Draft `SUBMISSION.md`** with these sections, each 2–5 tight sentences or bullets:
   - **Tagline**: one line, under 60 chars
   - **Inspiration**: the real problem and who it hurts
   - **What it does**: user-facing, concrete, no tech jargon
   - **How we built it**: stack and the one or two genuinely interesting technical decisions
   - **Challenges we ran into**: specific (e.g. "GSAP stalls in background tabs, so we added a timeout fallback")
   - **Accomplishments we're proud of**
   - **What we learned**
   - **What's next**: 3 bullets, ordered by impact
   - **Built with**: comma-separated tags (frameworks, libraries, APIs)
4. **Media checklist**: screenshots to capture (name each view), the demo video outline (≤ 2 min), and the repo/demo links.
5. Write in the team's voice: first-person plural, no AI attribution, no superlatives that aren't backed by a number.
