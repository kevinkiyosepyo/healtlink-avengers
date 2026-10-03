---
name: deploy-preview
description: Use when the user wants a shareable link, a live demo URL, or to "deploy", "host", or "put it online" — builds the Vite frontend and deploys a static preview (Vercel, Netlify, or GitHub Pages) after confirming the target with the user.
---

# Deploy Preview

The frontend is a static Vite build (`frontend/dist`), so it can be hosted anywhere static.

1. **Verify first.** `cd frontend && npm test && npm run build`. Don't deploy a red build.
2. **Pick a target.** Ask which provider unless the user already chose. Check which CLIs are installed and logged in (`vercel whoami`, `netlify status`, `gh auth status`). Deploying publishes the app publicly, so always confirm before running a deploy command.
   - **Vercel**: `cd frontend && npx vercel deploy --yes` (preview), add `--prod` only when asked. Build command `npm run build`, output dir `dist`.
   - **Netlify**: `cd frontend && npx netlify deploy --dir=dist` (draft URL), add `--prod` only when asked.
   - **GitHub Pages**: set `base: '/<repo-name>/'` in `vite.config.js`, build, and publish `dist` to a `gh-pages` branch (`npx gh-pages -d dist`). Note the base path change in the report.
3. **Never** commit tokens, add secrets to the repo, or change git identity. If a provider needs login, ask the user to run it themselves (`! npx vercel login`).
4. **Smoke test** the deployed URL in the browser: load it, run the golden path once, and check the console.
5. **Report** the URL, which provider and environment (preview or prod), and anything that differs from local.
