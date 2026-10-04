// One shared embedding worker (MiniLM, see workers/embed.worker.js) for every
// feature that needs local embeddings: chat search and the source library.
// The model downloads once and nothing leaves the browser.
let shared;
// The first call may download the model (~23 MB); after that calls take milliseconds.
const EMBED_TIMEOUT_MS = 120_000;

export function getEmbedder() {
  if (shared) return shared;
  let worker = null;
  let nextId = 0;
  const pending = new Map();
  const progressListeners = new Set();

  function failAll(error) {
    for (const request of pending.values()) request.reject(error);
    pending.clear();
    worker?.terminate();
    worker = null; // the next call starts a fresh worker
  }
  function ensureWorker() {
    if (worker) return;
    worker = new Worker(new URL("../workers/embed.worker.js", import.meta.url), { type: "module" });
    worker.addEventListener("message", ({ data }) => {
      if (data.type === "progress") {
        for (const listener of progressListeners) listener(Math.round(data.progress));
        return;
      }
      const request = pending.get(data.id);
      pending.delete(data.id);
      if (data.type === "result") request?.resolve(data.vectors);
      else if (data.type === "error") request?.reject(new Error(data.message));
    });
    worker.addEventListener("error", () => failAll(new Error("embedding worker unavailable")));
  }

  /** Embed texts → normalized 384-dim vectors (cosine similarity = dot product). */
  function embed(texts) {
    ensureWorker();
    return new Promise((resolve, reject) => {
      const id = ++nextId;
      // A stuck worker must not leave callers waiting forever.
      const timer = setTimeout(() => failAll(new Error("embedding timed out — try again")), EMBED_TIMEOUT_MS);
      pending.set(id, {
        resolve: (value) => (clearTimeout(timer), resolve(value)),
        reject: (error) => (clearTimeout(timer), reject(error)),
      });
      worker.postMessage({ type: "embed", id, texts });
    });
  }
  function onProgress(listener) {
    progressListeners.add(listener);
    return () => progressListeners.delete(listener);
  }

  shared = { embed, onProgress };
  return shared;
}
