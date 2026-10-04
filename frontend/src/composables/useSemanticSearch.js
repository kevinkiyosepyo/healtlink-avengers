import { ref, shallowRef, watch } from "vue";
import { createStore, del, get, keys, set } from "idb-keyval";
import { getEmbedder } from "../lib/embedder.js";

let instance;

async function loadIndexLib() {
  return import("../lib/semanticIndex.js");
}
let liveTextKeys = () => new Set();

// Shared, lazily started semantic index over the workspace's chats.
// status: idle → loading (model download) → ready | unavailable
export function useSemanticSearch(sessions) {
  if (instance) return instance;

  const status = ref("idle");
  const progress = ref(0);
  const indexSize = ref(0);
  const index = shallowRef(null);
  const embedder = getEmbedder();
  let syncing = Promise.resolve();

  let cache = null;
  try {
    const store = createStore("microfish-embeddings", "vectors");
    cache = {
      get: (key) => get(key, store),
      set: (key, value) => set(key, value, store),
      // Drop embeddings for text no longer in any chat (deleted chats leave nothing behind).
      async prune(liveKeys) {
        for (const key of await keys(store)) if (!liveKeys.has(key)) await del(key, store);
      },
    };
  } catch {
    /* No IndexedDB (private mode): embeddings are recomputed per session. */
  }

  async function start() {
    if (status.value !== "idle") return;
    status.value = "loading";
    try {
      embedder.onProgress((value) => (progress.value = value));
      // Orama is loaded on demand so it stays out of the first-paint bundle.
      const { createSemanticIndex, documentsFromSessions, textKey } = await loadIndexLib();
      liveTextKeys = (list) => new Set(documentsFromSessions(list).map((doc) => textKey(doc.text)));
      const created = await createSemanticIndex({ embed: embedder.embed, cache });
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
  }

  // Serialize syncs so overlapping edits never race inside the index.
  function queueSync() {
    syncing = syncing
      .then(async () => {
        if (!index.value) return;
        await index.value.sync(sessions.value);
        indexSize.value = index.value.size();
        await cache?.prune(liveTextKeys(sessions.value));
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
