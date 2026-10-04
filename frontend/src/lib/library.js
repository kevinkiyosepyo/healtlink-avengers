// "Bring your own sources": the research team's documents chunked, embedded
// locally and searched so the most relevant passages join the evidence pack.
//
// Retrieval engine (pure; embedder and store are injected):
//   • VectorIndex — int8-quantized embeddings in one contiguous, growable
//     Int8Array (per-row scale). ~4× less memory than Float32, cache-friendly
//     brute-force scan, O(1) amortized append.
//   • LexicalIndex — compact inverted index (term → row ids) with BM25-style
//     IDF scoring, so exact terms (NCT ids, drug names, doses) are found even
//     when embeddings miss them.
//   • Hybrid ranking — reciprocal-rank fusion of both signals, a per-chat
//     memory boost for passages already used in that conversation, then MMR
//     for diversity and a per-document cap.
//   • Passage text stays in IndexedDB; only final hits are loaded (small LRU).

export const CHUNK_TARGET = 900;
export const CHUNK_OVERLAP = 150;
export const MAX_CHUNKS_PER_DOC = 400;
export const DIMS = 384;
const EMBED_BATCH = 16;
const RRF_K = 60;
const CANDIDATES = 50;

// ---------- chunking ----------
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

// ---------- vectors ----------
/** Symmetric int8 quantization: v ≈ q * scale, scale = max|v| / 127. */
export function quantize(vector) {
  let max = 0;
  for (const value of vector) max = Math.max(max, Math.abs(value));
  const scale = max / 127 || 1;
  const q = new Int8Array(vector.length);
  for (let i = 0; i < vector.length; i++) q[i] = Math.round(vector[i] / scale);
  return { q, scale };
}

export function createVectorIndex(dims = DIMS) {
  let capacity = 0;
  let rows = 0;
  let data = new Int8Array(0);
  let scales = new Float32Array(0);
  function grow(min) {
    if (min <= capacity) return;
    capacity = Math.max(min, capacity * 2 || 256);
    const nextData = new Int8Array(capacity * dims);
    nextData.set(data);
    const nextScales = new Float32Array(capacity);
    nextScales.set(scales);
    data = nextData;
    scales = nextScales;
  }
  return {
    get size() {
      return rows;
    },
    bytes: () => data.byteLength + scales.byteLength,
    add(vector) {
      grow(rows + 1);
      const { q, scale } = quantize(vector);
      data.set(q, rows * dims);
      scales[rows] = scale;
      return rows++;
    },
    /** Cosine-like score of a float query against row r (vectors are unit-norm). */
    score(query, r) {
      let sum = 0;
      const offset = r * dims;
      for (let i = 0; i < dims; i++) sum += query[i] * data[offset + i];
      return sum * scales[r];
    },
    dot(a, b) {
      let sum = 0;
      const oa = a * dims;
      const ob = b * dims;
      for (let i = 0; i < dims; i++) sum += data[oa + i] * data[ob + i];
      return sum * scales[a] * scales[b];
    },
  };
}

// ---------- lexical ----------
const STOPWORDS = new Set("a an and are as at be by for from has have how in into is it its of on or that the this to was were what when which with would could might will does do did not no our your their they we you can may than then there these those about after before over under between also more most such per".split(" "));
export function terms(text) {
  const out = [];
  for (const raw of String(text).toLowerCase().match(/[a-z0-9][a-z0-9.\-]*[a-z0-9]|[a-z0-9]/g) ?? []) {
    if (raw.length < 2 || STOPWORDS.has(raw)) continue;
    // Light stemming keeps "visits"/"visit" together without mangling ids.
    out.push(/^[a-z]{4,}s$/.test(raw) && !raw.endsWith("ss") ? raw.slice(0, -1) : raw);
  }
  return out;
}

export function createLexicalIndex() {
  const postings = new Map(); // term → number[] of row ids (each row once)
  const lengths = []; // terms per row
  return {
    add(row, text) {
      const list = terms(text);
      lengths[row] = list.length;
      for (const term of new Set(list)) {
        const ids = postings.get(term);
        if (ids) ids.push(row);
        else postings.set(term, [row]);
      }
    },
    /** BM25 with binary term frequency (chunks are short): top `limit` rows. */
    search(query, limit, alive) {
      const n = lengths.length || 1;
      const avg = lengths.reduce((a, b) => a + (b ?? 0), 0) / n || 1;
      const scores = new Map();
      for (const term of new Set(terms(query))) {
        const ids = postings.get(term);
        if (!ids) continue;
        const idf = Math.log(1 + (n - ids.length + 0.5) / (ids.length + 0.5));
        for (const row of ids) {
          if (!alive(row)) continue;
          const norm = 1.2 * (0.25 + 0.75 * ((lengths[row] ?? avg) / avg));
          scores.set(row, (scores.get(row) ?? 0) + (idf * 2.2) / (1 + norm));
        }
      }
      return [...scores].sort((a, b) => b[1] - a[1]).slice(0, limit);
    },
    vocabulary: () => postings.size,
  };
}

// ---------- ranking ----------
/** Reciprocal-rank fusion over ranked lists of row ids, with optional per-row boosts. */
export function fuse(lists, boosts = new Map(), k = RRF_K) {
  const fused = new Map();
  for (const list of lists) list.forEach((row, rank) => fused.set(row, (fused.get(row) ?? 0) + 1 / (k + rank + 1)));
  for (const [row, boost] of boosts) if (fused.has(row)) fused.set(row, fused.get(row) + boost / (k + 1));
  return [...fused].sort((a, b) => b[1] - a[1]);
}

/** Maximal marginal relevance: trade relevance for novelty (λ=1 → pure relevance). */
export function mmr(candidates, similarity, { k, lambda = 0.75 } = {}) {
  const chosen = [];
  const pool = [...candidates];
  const top = pool[0]?.[1] || 1;
  while (chosen.length < k && pool.length) {
    let best = 0;
    let bestValue = -Infinity;
    pool.forEach(([row, relevance], i) => {
      const redundancy = chosen.length ? Math.max(...chosen.map((c) => similarity(row, c))) : 0;
      const value = lambda * (relevance / top) - (1 - lambda) * redundancy;
      if (value > bestValue) {
        bestValue = value;
        best = i;
      }
    });
    chosen.push(pool.splice(best, 1)[0][0]);
  }
  return chosen;
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
      reasons: [
        "supplied by your team — not externally verified",
        `semantic similarity ${hit.score}${hit.lexical ? ` · keyword match ${hit.lexical}` : ""}${hit.remembered ? " · used earlier in this chat" : ""}`,
      ],
    },
  }));
}

// ---------- library ----------
/**
 * Library over an injected embedder and async store
 * (store: get/set/del/keys; embed(texts) → unit vectors).
 */
export function createLibrary({ embed, store, dims = DIMS }) {
  let vectors = createVectorIndex(dims);
  let lexical = createLexicalIndex();
  let rowRefs = []; // row → { docId, chunk } ; null when deleted
  const docs = new Map(); // docId → metadata + chunk positions (no text)
  const textCache = new Map(); // small LRU of full doc records for hit text
  const queryCache = new Map(); // LRU of query embeddings
  const memory = new Map(); // sessionId → Map(row → weight)
  let loaded = null;

  const alive = (row) => rowRefs[row] !== null && rowRefs[row] !== undefined;

  function indexDoc(record) {
    record.chunks.forEach((chunk, i) => {
      const row = vectors.add(record.vectors[i]);
      lexical.add(row, chunk.text);
      rowRefs[row] = { docId: record.id, chunk: i };
    });
    docs.set(record.id, {
      id: record.id,
      name: record.name,
      type: record.type,
      chars: record.chars,
      pages: record.pages,
      addedAt: record.addedAt,
      truncated: record.truncated,
      chunks: record.chunks.map(({ index, start, end, line, page }) => ({ index, start, end, line, page })),
    });
  }

  function load() {
    loaded ??= (async () => {
      for (const id of await store.keys()) {
        const record = await store.get(id);
        if (record?.chunks) indexDoc(record); // texts are dropped after indexing
      }
    })();
    return loaded;
  }

  async function docRecord(id) {
    if (textCache.has(id)) {
      const record = textCache.get(id);
      textCache.delete(id);
      textCache.set(id, record);
      return record;
    }
    const record = await store.get(id);
    textCache.set(id, record);
    if (textCache.size > 4) textCache.delete(textCache.keys().next().value);
    return record;
  }

  async function embedQueries(texts) {
    const missing = texts.filter((t) => !queryCache.has(t));
    if (missing.length) {
      const fresh = await embed(missing);
      missing.forEach((t, i) => queryCache.set(t, Float32Array.from(fresh[i])));
      while (queryCache.size > 64) queryCache.delete(queryCache.keys().next().value);
    }
    return texts.map((t) => queryCache.get(t));
  }

  async function addDocument({ name, text, pages = null, type = "text" }, { onProgress = () => {} } = {}) {
    await load();
    const chunks = chunkText(text, { pages });
    if (!chunks.length) throw new Error("this document has no readable text.");
    const embedded = [];
    for (let i = 0; i < chunks.length; i += EMBED_BATCH) {
      const batch = await embed(chunks.slice(i, i + EMBED_BATCH).map((c) => c.text));
      embedded.push(...batch.map((v) => Float32Array.from(v)));
      onProgress(Math.min(chunks.length, i + EMBED_BATCH), chunks.length);
    }
    const record = {
      id: crypto.randomUUID(),
      name: String(name).slice(0, 200),
      type,
      chars: text.length,
      pages: pages?.length ?? null,
      addedAt: new Date().toISOString(),
      truncated: chunks.length >= MAX_CHUNKS_PER_DOC,
      chunks,
      vectors: embedded,
    };
    await store.set(record.id, record);
    indexDoc(record);
    return docs.get(record.id);
  }

  /** Deleting compacts the index from the stored records (rare, O(n)). */
  async function removeDocument(id) {
    await load();
    await store.del(id);
    docs.delete(id);
    textCache.delete(id);
    memory.clear();
    vectors = createVectorIndex(dims);
    lexical = createLexicalIndex();
    rowRefs = [];
    const remaining = [...docs.keys()];
    docs.clear();
    for (const docId of remaining) {
      const record = await store.get(docId);
      if (record?.chunks) indexDoc(record);
    }
  }

  async function list() {
    await load();
    return [...docs.values()].map(({ chunks, ...meta }) => ({ ...meta, chunks: chunks.length }));
  }

  /**
   * Hybrid search. Options: k, minScore (cosine floor for vector-only hits),
   * perDocument cap, sessionId (boost passages remembered for that chat).
   */
  async function search(queries, { k = 6, minScore = 0.25, perDocument = 3, sessionId = null } = {}) {
    await load();
    const texts = queries.map((q) => String(q).trim()).filter(Boolean);
    if (!texts.length || !vectors.size) return [];
    const queryVectors = await embedQueries(texts);

    const best = new Float32Array(vectors.size).fill(-1);
    for (let r = 0; r < vectors.size; r++) {
      if (!alive(r)) continue;
      for (const q of queryVectors) best[r] = Math.max(best[r], vectors.score(q, r));
    }
    const vectorRanked = [...best.keys()].filter((r) => alive(r)).sort((a, b) => best[b] - best[a]).slice(0, CANDIDATES);
    const lexicalHits = new Map();
    for (const text of texts) for (const [row, score] of lexical.search(text, CANDIDATES, alive)) lexicalHits.set(row, Math.max(lexicalHits.get(row) ?? 0, score));
    const lexicalRanked = [...lexicalHits].sort((a, b) => b[1] - a[1]).map(([row]) => row);

    // A passage qualifies if it's semantically close enough OR a keyword hit.
    const eligible = (row) => best[row] >= minScore || lexicalHits.has(row);
    const remembered = sessionId ? memory.get(sessionId) ?? new Map() : new Map();
    const fused = fuse([vectorRanked, lexicalRanked], remembered).filter(([row]) => eligible(row));

    const perDoc = new Map();
    const capped = fused.filter(([row]) => {
      const docId = rowRefs[row].docId;
      const used = perDoc.get(docId) ?? 0;
      if (used >= perDocument) return false;
      perDoc.set(docId, used + 1);
      return true;
    });
    const picked = mmr(capped, (a, b) => vectors.dot(a, b), { k });

    const hits = [];
    for (const row of picked) {
      const { docId, chunk } = rowRefs[row];
      const record = await docRecord(docId);
      const c = record.chunks[chunk];
      hits.push({
        row,
        docId,
        docName: record.name,
        chunkIndex: chunk,
        start: c.start,
        end: c.end,
        line: c.line,
        page: c.page,
        text: c.text,
        score: Math.round(best[row] * 100) / 100,
        lexical: lexicalHits.has(row) ? Math.round(lexicalHits.get(row) * 100) / 100 : null,
        remembered: remembered.has(row),
      });
    }
    return hits;
  }

  /**
   * Conversation memory: passages used in a chat get boosted on follow-ups.
   * Items are search hits ({ row }) or source locations ({ docId, chunk }).
   */
  function remember(sessionId, items) {
    if (!sessionId) return;
    const map = memory.get(sessionId) ?? new Map();
    for (const item of items) {
      const row = Number.isInteger(item.row) ? item.row : rowRefs.findIndex((ref) => ref && ref.docId === item.docId && ref.chunk === item.chunk);
      if (row >= 0 && alive(row)) map.set(row, Math.min(3, (map.get(row) ?? 0) + 1));
    }
    memory.set(sessionId, map);
  }

  return {
    load,
    addDocument,
    removeDocument,
    list,
    search,
    remember,
    size: () => docs.size,
    stats: () => ({ passages: vectors.size, vectorBytes: vectors.bytes(), vocabulary: lexical.vocabulary(), cachedDocs: textCache.size }),
  };
}
