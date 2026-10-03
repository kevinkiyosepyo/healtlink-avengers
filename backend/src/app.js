import express from "express";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const DIST = fileURLToPath(new URL("../../frontend/dist", import.meta.url));

// Serves the built app with strict security headers. There is deliberately no
// data or model API: chats, records and the researcher's OpenAI key stay in
// the browser, which talks to api.openai.com directly.
export function createApp({ serveStatic = existsSync(DIST) } = {}) {
  const app = express();
  app.disable("x-powered-by");

  app.use((req, res, next) => {
    res.set({
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "X-Frame-Options": "DENY",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
      // Only this origin, the OpenAI API, and the embedding model CDN.
      "Content-Security-Policy": [
        "default-src 'self'",
        // blob: is needed because the self-hosted ONNX runtime imports its glue via a same-origin blob URL.
        "script-src 'self' 'wasm-unsafe-eval' blob:",
        "worker-src 'self' blob:",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob:",
        "font-src 'self' data:",
        "connect-src 'self' https://api.openai.com https://huggingface.co https://*.huggingface.co https://*.hf.co",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'none'",
      ].join("; "),
    });
    next();
  });

  app.get("/api/health", (req, res) => res.json({ ok: true }));
  app.all("/api/{*rest}", (req, res) => res.status(404).json({ error: "not_found" }));

  if (serveStatic) {
    app.use(express.static(DIST, { maxAge: "1h", index: false }));
    app.get("/{*rest}", (req, res) => res.sendFile("index.html", { root: DIST }));
  }
  return app;
}
