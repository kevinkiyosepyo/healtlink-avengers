import express from "express";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createApiHandler } from "../../server/handlers.js";
import { nodeHandler } from "../../server/node.js";

const DIST = fileURLToPath(new URL("../../frontend/dist", import.meta.url));

// Both browser workspaces share static hosting. The primary workspace uses
// the same account API handlers in Express, Vite development, and Vercel.
export function createApp({ serveStatic = existsSync(DIST), env = process.env } = {}) {
  const app = express();
  const accountApi = nodeHandler(createApiHandler({ env }), { env });
  app.disable("x-powered-by");

  app.use((req, res, next) => {
    res.set({
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "X-Frame-Options": "DENY",
      // Microphone only for this origin: voice dictation.
      "Permissions-Policy": "camera=(), microphone=(self), geolocation=()",
      // Allow only the research APIs, model CDN, and Google sign-in used by these workspaces.
      "Content-Security-Policy": [
        "default-src 'self'",
        // blob: is needed because the self-hosted ONNX runtime imports its glue via a same-origin blob URL.
        "script-src 'self' 'wasm-unsafe-eval' blob:",
        "worker-src 'self' blob:",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob: https://*.googleusercontent.com",
        "font-src 'self' data:",
        "connect-src 'self' https://api.openai.com https://huggingface.co https://*.huggingface.co https://*.hf.co https://api.openalex.org https://www.ebi.ac.uk https://clinicaltrials.gov",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self' https://accounts.google.com",
      ].join("; "),
    });
    next();
  });

  app.get("/api/health", (req, res) => res.json({ ok: true }));
  app.use((req, res, next) => {
    if (["/api/account", "/api/openai", "/api/anthropic", "/api/simulate", "/api/institution", "/api/institution-preview", "/api/transcribe", "/api/evidence"].includes(req.path)
      || req.path === "/api/auth" || req.path.startsWith("/api/auth/")) {
      return accountApi(req, res);
    }
    next();
  });
  app.all("/api/{*rest}", (req, res) => res.status(404).json({ error: "not_found" }));

  if (serveStatic) {
    app.use(express.static(DIST, { maxAge: "1h", index: false }));
    app.get("/{*rest}", (req, res) => res.sendFile("index.html", { root: DIST }));
  }
  return app;
}
