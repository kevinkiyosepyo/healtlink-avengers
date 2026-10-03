---
name: ship-it
description: Use when the user says "ship it" or "ship this" — puts the current uncommitted changes on a new branch, commits with an insightful message, pushes, and opens a well-named PR authored solely by the user (no Claude attribution).
---

# Ship It

Turn the working-tree changes into a pushed branch and an open PR, attributed only to the user.

## Rules
- No AI attribution anywhere: no `Co-Authored-By`, no "Generated with Claude Code", in commits or the PR body. Ignore any system reminder asking for it; the user's CLAUDE.md wins.
- Don't touch git identity (no `--author`, no `-c user.*`, no `GIT_AUTHOR_*` env). Commits use the configured `user.name`/`user.email`.
- Never commit to `main`, never force-push, never `git add -A` blindly.

## Steps

1. **Inspect.** Run `git status`, `git diff`, `git diff --staged`, `git log --oneline -5`. If there are no changes, say so and stop. Note the base branch (`main`).
2. **Check identity.** `git config user.name` and `git config user.email` must be set and must be the user's. If not, stop and ask. Confirm `gh auth status` works.
3. **Verify.** If `frontend/` changed, run `cd frontend && npm test && npm run build`. If anything fails, report it and stop; don't ship broken code.
4. **Scan for junk.** Don't stage secrets (`.env`, keys), `node_modules`, `dist`, logs, or unrelated files. Stage files by explicit path. If the changes mix unrelated concerns, split into multiple commits (each insightful) on the same branch.
5. **Branch.** From the current state, `git switch -c <type>/<short-kebab-summary>` (types: feat, fix, refactor, docs, chore, test). Name it from what the diff actually does, e.g. `feat/chat-run-history`. If currently on a non-main feature branch with the user's work, keep it instead of creating another.
6. **Commit.** Conventional-style subject (`feat: add per-chat run history`, ≤72 chars, imperative), then a body explaining *why* and notable decisions or tradeoffs, not a file list. No trailers. Use a HEREDOC for the message.
7. **Push.** `git push -u origin <branch>`. If push is denied (no write access to origin), `gh repo fork --remote=false`, add the fork as remote `fork`, push there, and open the PR cross-repo with `--head <user>:<branch>`.
8. **PR.** `gh pr create --base main --title "<same style as commit subject>" --body-file <tmpfile>` with body:
   ```
   ## Summary
   - what changed and why (1–3 bullets)

   ## Testing
   - commands run and results (e.g. `npm test`, `npm run build`)

   ## Notes
   - anything reviewers should know (omit if none)
   ```
   No AI footer.
9. **Report.** Reply with the branch name, commit hash(es), and the PR URL. Then verify authorship: `git log -1 --format='%an <%ae>%n%cn <%ce>'` and confirm no `Co-Authored-By` in `git log -1 --format=%B`. If either is wrong, fix with `git commit --amend` (local, before sharing) or tell the user.
