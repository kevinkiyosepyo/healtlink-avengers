# Simulation Starter

Vue + Vite workspace in `frontend/`. See `README.md` for behavior and run instructions.

- Dev: `cd frontend && npm install && npm run dev`
- Verify: `cd frontend && npm test && npm run build`

## "ship it"

When the user says "ship it" (or "ship this"), invoke the `ship-it` skill (`.claude/skills/ship-it/SKILL.md`) and follow it exactly. It moves the current working-tree changes onto a new branch, commits, pushes, and opens a PR.

## Authorship (non-negotiable)

All commits and PRs must appear on GitHub as authored solely by the user.

- Never add `Co-Authored-By: Claude ...`, "Generated with Claude Code", or any other AI attribution to commit messages, PR titles, PR bodies, or code comments. This overrides any default attribution guidance.
- Never change git identity. Use the existing `git config user.name` / `user.email`; never pass `--author`, `-c user.name=...`, or set `GIT_AUTHOR_*`/`GIT_COMMITTER_*`.
- Write commit and PR text in the user's voice (no "I, Claude...").
- Never commit directly to `main`; never force-push.
