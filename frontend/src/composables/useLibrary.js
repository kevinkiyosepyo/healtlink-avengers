import { computed, ref } from "vue";
import { createStore, del, get, keys, set } from "idb-keyval";
import { getEmbedder } from "../lib/embedder.js";
import { createLibrary, hitsToSources } from "../lib/library.js";
import { readJson, writeJson } from "../lib/storage.js";

const SETTINGS_KEY = "microfish:library";
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_TEXT_CHARS = 2_000_000;
const TEXT_TYPES = /\.(txt|md|markdown|csv|tsv|json)$/i;

let instance;

/** The team's local source library (RAG). Documents never leave the browser. */
export function useLibrary() {
  if (instance) return instance;
  const idb = createStore("microfish-library", "documents");
  const library = createLibrary({
    embed: getEmbedder().embed,
    store: { get: (k) => get(k, idb), set: (k, v) => set(k, v, idb), del: (k) => del(k, idb), keys: () => keys(idb) },
  });
  const documents = ref([]);
  const busy = ref(null); // { name, done, total } while adding
  const error = ref("");
  const enabled = ref(readJson(SETTINGS_KEY, {}).enabled !== false);

  async function refresh() {
    documents.value = (await library.list()).sort((a, b) => b.addedAt.localeCompare(a.addedAt));
  }
  void refresh().catch(() => (error.value = "this browser can't store the library (private mode?)."));

  async function addText(name, text, pages = null, type = "text") {
    if (text.length > MAX_TEXT_CHARS) throw new Error(`${name} is too long (over 2 million characters).`);
    busy.value = { name, done: 0, total: 0 };
    try {
      await library.addDocument({ name, text, pages, type }, { onProgress: (done, total) => (busy.value = { name, done, total }) });
      await refresh();
    } finally {
      busy.value = null;
    }
  }

  async function addFiles(files) {
    error.value = "";
    for (const file of files) {
      try {
        if (file.size > MAX_FILE_BYTES) throw new Error(`${file.name} is over 25 MB.`);
        if (/\.pdf$/i.test(file.name) || file.type === "application/pdf") {
          busy.value = { name: file.name, done: 0, total: 0 };
          const { extractPdfText } = await import("../lib/pdfText.js");
          const { text, pages } = await extractPdfText(file);
          await addText(file.name, text, pages, "pdf");
        } else if (TEXT_TYPES.test(file.name) || file.type.startsWith("text/")) {
          await addText(file.name, await file.text());
        } else {
          throw new Error(`${file.name}: add pdf, txt, md, csv or json files (word documents: save as pdf first).`);
        }
      } catch (cause) {
        error.value = cause.message;
        busy.value = null;
      }
    }
  }

  async function addPasted(name, text) {
    error.value = "";
    try {
      await addText(name.trim() || `pasted notes ${new Date().toLocaleDateString()}`, text);
    } catch (cause) {
      error.value = cause.message;
    }
  }

  async function remove(id) {
    await library.removeDocument(id);
    await refresh();
  }

  /** For the deliberation: queries → citable Sources, or [] when off/empty. */
  async function searchSources(queries) {
    if (!enabled.value || !library.size()) return [];
    return hitsToSources(await library.search(queries));
  }

  function setEnabled(value) {
    enabled.value = value;
    writeJson(SETTINGS_KEY, { enabled: value });
  }

  instance = {
    documents,
    busy,
    error,
    enabled,
    setEnabled,
    addFiles,
    addPasted,
    remove,
    search: (query) => library.search([query], { k: 8, minScore: 0.2 }),
    searchSources,
    count: computed(() => documents.value.length),
    chunkCount: computed(() => documents.value.reduce((n, d) => n + d.chunks, 0)),
  };
  return instance;
}
