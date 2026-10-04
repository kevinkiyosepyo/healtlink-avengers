// "Bring your own sources": the research team's documents (protocols, survey
// summaries, policy text, notes) chunked and embedded locally, then searched
// so the most relevant passages join the evidence pack as citable sources.
// Pure logic: the embedder and the key-value store are injected.

export const CHUNK_TARGET = 900;
export const CHUNK_OVERLAP = 150;
export const MAX_CHUNKS_PER_DOC = 400;
const EMBED_BATCH = 16;

/** Locate the 1-based line and (if page starts are known) page of a char offset. */
function position(text, offset, pages) {
  let line = 1;
  for (let i = 0; i < offset; i++) if (text.charCodeAt(i) === 10) line++;
  let page = null;
  for (const p of pages ?? []) if (p.start <= offset) page = p.page;
  return { line, page };
}

/**
 * Split text into ~CHUNK_TARGET-char chunks on paragraph, then sentence,
 * boundaries, each overlapping the previous by ~CHUNK_OVERLAP chars so a fact
 * split across a boundary is still retrievable. Offsets point into `text`.
 */
export function chunkText(text, { pages = null, target = CHUNK_TARGET, overlap = CHUNK_OVERLAP, maxChunks = MAX_CHUNKS_PER_DOC } = {}) {
  const source = String(text ?? "");
  // Units: paragraphs, with long paragraphs split into sentences.
  const units = [];
  const paragraph = /[^\n]+(?:\n(?!\s*\n)[^\n]*)*/g;
  for (const match of source.matchAll(paragraph)) {
    const body = match[0];
    if (!body.trim()) continue;
    if (body.length <= target) {
      units.push({ start: match.index, end: match.index + body.length });
      continue;
    }
    const sentence = /[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g;
    for (const s of body.matchAll(sentence)) {
      // A single huge "sentence" (tables, no punctuation) is hard-split.
      for (let cut = 0; cut < s[0].length; cut += target) {
        const start = match.index + s.index + cut;
        units.push({ start, end: Math.min(start + target, match.index + s.index + s[0].length) });
      }
    }
  }
  const chunks = [];
  let current = null;
  for (const unit of units) {
    if (current && unit.end - current.start > target) {
      chunks.push(current);
      if (chunks.length >= maxChunks) break;
      // Overlap: restart from a word boundary ~overlap chars before the cut.
      let start = Math.max(current.start, current.end - overlap);
      while (start > current.start && !/\s/.test(source[start - 1])) start--;
      current = { start: start < unit.start ? start : unit.start, end: unit.end };
    } else {
      current = current ? { start: current.start, end: unit.end } : { ...unit };
    }
  }
  if (current && chunks.length < maxChunks) chunks.push(current);
  return chunks.map((chunk, index) => ({
    index,
    start: chunk.start,
    end: chunk.end,
    text: source.slice(chunk.start, chunk.end).replace(/\s+/g, " ").trim(),
    ...position(source, chunk.start, pages),
  }));
}

const dot = (a, b) => {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
};

/**
 * Rank chunks against one or more query vectors (score = best match across
 * queries; vectors are normalized so dot product = cosine similarity). At most
 * `perDocument` passages per document keeps one long file from crowding out others.
 */
export function rankChunks(documents, queryVectors, { k = 6, minScore = 0.25, perDocument = 3 } = {}) {
  const scored = [];
  for (const doc of documents) {
    doc.chunks.forEach((chunk, i) => {
      const vector = doc.vectors[i];
      if (!vector) return;
      const score = Math.max(...queryVectors.map((q) => dot(q, vector)));
      if (score >= minScore) scored.push({ doc, chunk, score });
    });
  }
  scored.sort((a, b) => b.score - a.score);
  const perDoc = new Map();
  const hits = [];
  for (const hit of scored) {
    const used = perDoc.get(hit.doc.id) ?? 0;
    if (used >= perDocument) continue;
    perDoc.set(hit.doc.id, used + 1);
    hits.push({
      docId: hit.doc.id,
      docName: hit.doc.name,
      chunkIndex: hit.chunk.index,
      start: hit.chunk.start,
      end: hit.chunk.end,
      line: hit.chunk.line,
      page: hit.chunk.page,
      text: hit.chunk.text,
      score: Math.round(hit.score * 100) / 100,
    });
    if (hits.length >= k) break;
  }
  return hits;
}

/** Library hits → evidence Sources (kind "document"), clearly marked as team-supplied. */
export function hitsToSources(hits) {
  return hits.map((hit) => ({
    id: `library:${hit.docId}:${hit.chunkIndex}`,
    database: "Your library",
    kind: "document",
    title: `${hit.docName} — passage ${hit.chunkIndex + 1}${hit.page ? ` (p. ${hit.page})` : ""}`,
    authors: [],
    venue: hit.docName,
    venueType: "document",
    year: null,
    doi: null,
    pmid: null,
    nct: null,
    url: null,
    abstract: hit.text,
    citations: 0,
    studyTypes: ["team document"],
    retracted: false,
    status: null,
    location: { docId: hit.docId, chunk: hit.chunkIndex, start: hit.start, end: hit.end, line: hit.line, page: hit.page },
    relevance: hit.score,
    credibility: {
      score: 70,
      tier: "yours",
      reasons: ["supplied by your team — not externally verified", `semantic similarity ${hit.score} to the queries`],
    },
  }));
}

/**
 * Library over an injected embedder and async store
 * (store: get/set/del/keys; embed(texts) → vectors).
 */
export function createLibrary({ embed, store }) {
  const docs = new Map();
  let loaded = null;

  function load() {
    loaded ??= (async () => {
      for (const id of await store.keys()) {
        const doc = await store.get(id);
        if (doc?.chunks) docs.set(id, doc);
      }
    })();
    return loaded;
  }

  async function addDocument({ name, text, pages = null, type = "text" }, { onProgress = () => {} } = {}) {
    await load();
    const chunks = chunkText(text, { pages });
    if (!chunks.length) throw new Error("this document has no readable text.");
    const vectors = [];
    for (let i = 0; i < chunks.length; i += EMBED_BATCH) {
      const batch = await embed(chunks.slice(i, i + EMBED_BATCH).map((c) => c.text));
      vectors.push(...batch.map((v) => Float32Array.from(v)));
      onProgress(Math.min(chunks.length, i + EMBED_BATCH), chunks.length);
    }
    const doc = {
      id: crypto.randomUUID(),
      name: String(name).slice(0, 200),
      type,
      chars: text.length,
      pages: pages?.length ?? null,
      addedAt: new Date().toISOString(),
      truncated: chunks.length >= MAX_CHUNKS_PER_DOC,
      chunks,
      vectors,
    };
    await store.set(doc.id, doc);
    docs.set(doc.id, doc);
    return doc;
  }

  async function removeDocument(id) {
    await load();
    docs.delete(id);
    await store.del(id);
  }

  async function list() {
    await load();
    return [...docs.values()].map(({ vectors, chunks, ...meta }) => ({ ...meta, chunks: chunks.length }));
  }

  async function search(queries, options) {
    await load();
    const texts = queries.map((q) => String(q).trim()).filter(Boolean);
    if (!texts.length || !docs.size) return [];
    const queryVectors = await embed(texts);
    return rankChunks([...docs.values()], queryVectors, options);
  }

  return { load, addDocument, removeDocument, list, search, size: () => docs.size };
}
