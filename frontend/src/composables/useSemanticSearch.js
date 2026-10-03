import { ref, shallowRef, watch } from "vue";
import { createStore, get, set } from "idb-keyval";

let instance;

// Shared, lazily started semantic index over the workspace's chats.
// status: idle → loading (model download) → ready | unavailable
export function useSemanticSearch(sessions) {
  if (instance) return instance;

  const status = ref("idle");
  const progress = ref(0);
  const indexSize = ref(0);
  const index = shallowRef(null);
  let worker;
  let nextId = 0;
  const pending = new Map();
  let syncing = Promise.resolve();

  function embed(texts) {
    return new Promise((resolve, reject) => {
      const id = ++nextId;
      pending.set(id, { resolve, reject });
      worker.postMessage({ type: "embed", id, texts });
    });
  }

  let cache = null;
  try {
    const store = createStore("microfish-embeddings", "vectors");
    cache = { get: (key) => get(key, store), set: (key, value) => set(key, value, store) };
  } catch {
    /* No IndexedDB (private mode): embeddings are recomputed per session. */
  }

  async function start() {
    if (status.value !== "idle") return;
    status.value = "loading";
    try {
      worker = new Worker(new URL("../workers/embed.worker.js", import.meta.url), { type: "module" });
      worker.addEventListener("message", ({ data }) => {
        if (data.type === "progress") progress.value = Math.round(data.progress);
        else if (data.type === "result" || data.type === "error") {
          const request = pending.get(data.id);
          pending.delete(data.id);
          if (data.type === "result") request?.resolve(data.vectors);
          else request?.reject(new Error(data.message));
        }
      });
      worker.addEventListener("error", () => fail());
      // Orama is loaded on demand so it stays out of the first-paint bundle.
      const { createSemanticIndex } = await import("../lib/semanticIndex.js");
      const created = await createSemanticIndex({ embed, cache });
      // First sync runs unqueued so a model failure surfaces as "unavailable".
      await created.sync(sessions.value);
      index.value = created;
      indexSize.value = created.size();
      status.value = "ready";
      queueSync();
    } catch {
      fail();
    }
  }
  function fail() {
    status.value = "unavailable";
    for (const request of pending.values()) request.reject(new Error("embedding worker unavailable"));
    pending.clear();
  }

  // Serialize syncs so overlapping edits never race inside the index.
  function queueSync() {
    syncing = syncing
      .then(async () => {
        if (!index.value) return;
        await index.value.sync(sessions.value);
        indexSize.value = index.value.size();
      })
      .catch(() => {});
    return syncing;
  }

  let timer;
  watch(
    () => sessions.value.map((session) => [session.id, session.title, session.messages.length]),
    () => {
      clearTimeout(timer);
      timer = setTimeout(queueSync, 400);
    },
    { deep: true },
  );

  async function query(term, options) {
    if (status.value !== "ready" || !index.value) return [];
    try {
      return await index.value.query(term, options);
    } catch {
      return [];
    }
  }

  instance = { status, progress, indexSize, start, query };
  return instance;
}
