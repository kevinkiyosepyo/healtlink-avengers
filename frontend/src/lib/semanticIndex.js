import { count, create, insertMultiple, remove, search } from "@orama/orama";

export const EMBEDDING_DIMENSIONS = 384;

// One document per piece of searchable text: a chat title or a user prompt.
// Stable ids let us diff instead of rebuilding the index on every change.
export function documentsFromSessions(sessions) {
  const docs = [];
  for (const session of sessions) {
    docs.push({ id: `${session.id}:title`, sessionId: session.id, kind: "title", text: session.title });
    for (const message of session.messages) {
      if (message.role === "user" && message.content?.trim()) {
        docs.push({ id: `${session.id}:${message.id}`, sessionId: session.id, kind: "prompt", text: message.content });
      }
    }
  }
  return docs;
}

// Small, fast, non-cryptographic hash (FNV-1a) used as the embedding cache key.
export function textKey(text) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `v1:${(hash >>> 0).toString(36)}:${text.length}`;
}

/**
 * In-browser vector index over chats.
 * `embed(texts) => Promise<number[][]>` is injected so the model can live in a
 * Web Worker in the app and be faked in tests. `cache` is any async key-value
 * store (`get`/`set`); embeddings are cached by text so nothing is embedded twice.
 */
export async function createSemanticIndex({ embed, cache = null, dimensions = EMBEDDING_DIMENSIONS }) {
  const db = create({
    schema: { sessionId: "string", kind: "string", text: "string", embedding: `vector[${dimensions}]` },
  });
  const indexed = new Map(); // doc id -> text currently in the index

  async function vectorsFor(texts) {
    const vectors = new Array(texts.length);
    const missing = [];
    await Promise.all(
      texts.map(async (text, index) => {
        const cached = cache ? await cache.get(textKey(text)) : undefined;
        if (cached) vectors[index] = Array.from(cached);
        else missing.push(index);
      }),
    );
    if (missing.length) {
      const fresh = await embed(missing.map((index) => texts[index]));
      await Promise.all(
        missing.map(async (index, position) => {
          vectors[index] = fresh[position];
          if (cache) await cache.set(textKey(texts[index]), Float32Array.from(fresh[position]));
        }),
      );
    }
    return vectors;
  }

  // Bring the index in line with the current sessions; only changed text is embedded.
  async function sync(sessions) {
    const docs = documentsFromSessions(sessions);
    const wanted = new Map(docs.map((doc) => [doc.id, doc]));
    const stale = [...indexed.keys()].filter((id) => wanted.get(id)?.text !== indexed.get(id));
    for (const id of stale) {
      await remove(db, id);
      indexed.delete(id);
    }
    const added = docs.filter((doc) => !indexed.has(doc.id));
    if (!added.length) return { added: 0, removed: stale.length };
    const vectors = await vectorsFor(added.map((doc) => doc.text));
    await insertMultiple(
      db,
      added.map((doc, index) => ({ ...doc, embedding: vectors[index] })),
    );
    for (const doc of added) indexed.set(doc.id, doc.text);
    return { added: added.length, removed: stale.length };
  }

  // Hybrid search (BM25 + cosine) ranked per session. MiniLM cosine for short
  // queries is low (~0.2–0.3 for real matches), so the threshold is deliberately loose.
  async function query(term, { limit = 8, similarity = 0.2 } = {}) {
    const text = term.trim();
    if (!text || !indexed.size) return [];
    const [vector] = await vectorsFor([text]);
    const result = await search(db, {
      mode: "hybrid",
      term: text,
      vector: { value: vector, property: "embedding" },
      similarity,
      limit: limit * 4,
      includeVectors: false,
    });
    const bySession = new Map();
    for (const hit of result.hits) {
      const current = bySession.get(hit.document.sessionId);
      if (!current || hit.score > current.score) {
        bySession.set(hit.document.sessionId, { sessionId: hit.document.sessionId, score: hit.score, text: hit.document.text });
      }
    }
    return [...bySession.values()].sort((a, b) => b.score - a.score).slice(0, limit);
  }

  return { sync, query, size: () => count(db) };
}
