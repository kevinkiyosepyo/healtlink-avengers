import { DATABASES } from "../frontend/src/lib/evidence/sources.js";
import { CONTEXT_INSTRUCTIONS } from "./simulationContext.js";
import { HttpError } from "./security.js";

const MAX_PASSAGES = 8;
const MAX_SCHOLARLY = 6;
const MAX_SOURCE_BYTES = 512 * 1024;
const REVIEW_FORMAT = 'Return only one JSON object with this shape: {"summary":"short overview","claims":[{"text":"a specific observation","sources":["S1"]}],"disagreements":["an unresolved tradeoff"],"questions":["a useful next question"]}. Use at most 6 claims, 3 disagreements and 4 questions. Keep summary under 800 characters and each item under 500 characters.';
const INSTRUCTIONS = `You provide one cited evidence review for a research-planning simulation. Consider research ethics, participant burden, and study operations. You are an AI, not an actual board member, and this is preparation, not an IRB determination, clinical advice or a validated prediction. Do not estimate numerical effects or approval probabilities. Distinguish supporting evidence from assumptions and unresolved disagreements. The supplied scholarly excerpts are search results, not full papers or proof of causation. Researcher-supplied document passages are unverified local context. Cite only supplied source IDs in each claim's sources array; use an empty array when no source supports a claim. Do not invent URLs, citations or evidence. Do not put citation IDs in prose fields: use only the sources arrays. If a signed institution snapshot is present, use only its verified professional backgrounds and policies to contextualize the review; never impersonate members or predict their votes. No verified snapshot means no university-specific membership or policy claims.${CONTEXT_INSTRUCTIONS} ${REVIEW_FORMAT}`;

const clean = (value, limit) => typeof value === "string" ? value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, limit) : "";
function invalid(message = "Enter a research question and up to eight readable source passages.") {
  throw new HttpError(400, "invalid_evidence_input", message);
}
function abortIfNeeded(signal) {
  if (signal?.aborted) throw new HttpError(408, "review_cancelled", "The evidence review was cancelled or timed out.");
}
function boundedText(value, max, required = true) {
  if (typeof value !== "string" || value.length > max || (required && !value.trim())) invalid();
  return value.trim();
}

export function evidenceInput(body) {
  const query = boundedText(body.query, 2000);
  const passages = body.passages === undefined ? [] : body.passages;
  if (!Array.isArray(passages) || passages.length > MAX_PASSAGES) invalid();
  const documents = passages.map(passage => {
    if (!passage || typeof passage !== "object" || Array.isArray(passage)) invalid();
    const originalId = boundedText(passage.id, 120);
    const documentId = boundedText(passage.documentId, 120);
    const title = boundedText(passage.name, 300);
    const excerpt = boundedText(passage.text, 2000);
    const { lineStart, lineEnd } = passage;
    if ((lineStart !== undefined || lineEnd !== undefined) && (!Number.isSafeInteger(lineStart) || !Number.isSafeInteger(lineEnd) || lineStart < 1 || lineEnd < lineStart || lineEnd > 2_000_000)) invalid("Source line numbers are invalid.");
    return { originalId, documentId, title, excerpt, kind: "document", database: "Researcher source library", url: null, ...(lineStart === undefined ? {} : { lineStart, lineEnd }) };
  });
  if (new Set(documents.map(source => source.originalId)).size !== documents.length) invalid("Source passages need distinct identifiers.");
  return { query, documents };
}

// Read a bounded response stream; neither a bogus Content-Length nor an endless
// chunked response can bypass the cap. The same cancellation covers body reads.
async function boundedJson(response, signal, limit = MAX_SOURCE_BYTES) {
  if (Number(response.headers.get("content-length")) > limit) {
    await response.body?.cancel();
    throw new Error("Response exceeds limit");
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Empty response");
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal?.addEventListener("abort", cancel, { once: true });
  const chunks = [];
  let size = 0;
  try {
    abortIfNeeded(signal);
    while (true) {
      const { value, done } = await reader.read();
      abortIfNeeded(signal);
      if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw new Error("Response exceeds limit"); }
      chunks.push(Buffer.from(value));
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } finally {
    signal?.removeEventListener("abort", cancel);
    reader.releaseLock();
  }
}

function safeUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}
function normalizedPayload(key, payload) {
  // Limit records before invoking the shared normalizers. Bound inverted-index
  // offsets too: an enormous sparse position must not allocate a huge array.
  if (key === "openalex") return { results: (Array.isArray(payload.results) ? payload.results : []).slice(0, 3).map(work => ({
    ...work,
    abstract_inverted_index: Object.fromEntries(Object.entries(work.abstract_inverted_index || {}).slice(0, 1500).map(([word, positions]) => [word.slice(0, 120), Array.isArray(positions) ? positions.filter(position => Number.isInteger(position) && position >= 0 && position < 4000).slice(0, 100) : []])),
  })) };
  if (key === "europepmc") return { resultList: { result: (Array.isArray(payload.resultList?.result) ? payload.resultList.result : []).slice(0, 3) } };
  return { studies: (Array.isArray(payload.studies) ? payload.studies : []).slice(0, 3) };
}

async function scholarlySources(query, { signal, fetchImpl }) {
  // Only the explicitly entered search question becomes a public search. Study
  // documents, dictation and signed institution snapshots never go to databases.
  const terms = query.replace(/[^\p{L}\p{N}\s-]/gu, " ").split(/\s+/).filter(Boolean).slice(0, 24).join(" ").slice(0, 220);
  const settled = await Promise.all(Object.entries(DATABASES).map(async ([key, database]) => {
    const searchSignal = AbortSignal.any([signal, AbortSignal.timeout(7000)]);
    try {
      abortIfNeeded(searchSignal);
      // URLs come exclusively from fixed scholarly API builders; input passages
      // and returned links are never fetched, and redirects are refused.
      const response = await fetchImpl(database.url(terms, 3), { signal: searchSignal, redirect: "error", headers: { Accept: "application/json" } });
      if (!response.ok) { await response.body?.cancel(); throw new Error("Search unavailable"); }
      const payload = await boundedJson(response, searchSignal);
      const sources = database.parse(normalizedPayload(key, payload)).filter(source => !source.retracted && source.title && source.abstract && safeUrl(source.url)).map(source => ({
        title: clean(source.title, 300), excerpt: clean(source.abstract, 1400), url: safeUrl(source.url),
        kind: source.kind, database: database.label, year: source.year, doi: source.doi || null,
      }));
      return { sources, warning: null };
    } catch {
      return { sources: [], warning: `${database.label} could not be searched. No results from it are included.` };
    }
  }));
  abortIfNeeded(signal);
  const unique = new Map();
  for (const { sources } of settled) for (const source of sources) {
    const key = source.doi || source.url;
    if (!unique.has(key)) unique.set(key, source);
  }
  return { sources: [...unique.values()].slice(0, MAX_SCHOLARLY), warnings: settled.map(item => item.warning).filter(Boolean) };
}

export function normalizeEvidenceReview(value, sourceIds) {
  if (!value || typeof value !== "object" || Array.isArray(value) || typeof value.summary !== "string" || !value.summary.trim() || !Array.isArray(value.claims) || !Array.isArray(value.disagreements) || !Array.isArray(value.questions)) {
    throw new HttpError(502, "invalid_evidence_review", "The provider returned an incomplete evidence review. Try again.");
  }
  let invalidDropped = 0;
  // Citation-shaped text outside sources arrays cannot masquerade as a verified
  // citation. The renderer below is the only place source IDs enter prose.
  const prose = (text, max) => clean(text, max).replace(/\[S\d+\]/gi, "[citation not verified]");
  const claims = value.claims.slice(0, 6).filter(claim => claim && typeof claim.text === "string" && claim.text.trim()).map(claim => {
    const proposed = Array.isArray(claim.sources) ? claim.sources.slice(0, 20) : [];
    const sources = [...new Set(proposed.filter(id => typeof id === "string" && sourceIds.has(id)))];
    invalidDropped += proposed.length - proposed.filter(id => typeof id === "string" && sourceIds.has(id)).length;
    return { text: prose(claim.text, 700), sources, uncited: sources.length === 0 };
  });
  const list = (items, max) => items.filter(item => typeof item === "string" && item.trim()).slice(0, max).map(item => prose(item, 500));
  return { summary: prose(value.summary, 1000), claims, disagreements: list(value.disagreements, 3), questions: list(value.questions, 4), citationAudit: { invalidDropped, uncited: claims.filter(claim => claim.uncited).length } };
}

export async function reviewEvidence(body, { context, provider, model, signal, fetchImpl = globalThis.fetch, requestReview }) {
  const { query, documents } = evidenceInput(body);
  abortIfNeeded(signal);
  const scholarly = await scholarlySources(query, { signal, fetchImpl });
  const policies = (context.institution?.policies || []).slice(0, 4).filter(policy => safeUrl(policy.sourceUrl) && typeof policy.summary === "string").map(policy => ({
    title: clean(policy.title, 300), excerpt: clean(policy.summary, 700), url: safeUrl(policy.sourceUrl),
    kind: "institution-policy", database: "Verified institution snapshot", retrievedAt: context.institution.retrievedAt,
  }));
  const sources = [...documents, ...policies, ...scholarly.sources].map((source, index) => ({ ...source, id: `S${index + 1}` }));
  const input = [
    ...(context.message ? [context.message] : []),
    { role: "user", content: JSON.stringify({ type: "evidence_review_data", question: query, sources }) },
  ];
  abortIfNeeded(signal);
  let response;
  try { response = await requestReview({ instructions: INSTRUCTIONS, input }); }
  catch (error) { abortIfNeeded(signal); throw error; }
  let value;
  try {
    const data = await boundedJson(response, signal, 128 * 1024);
    const completed = provider === "anthropic" ? data.type === "message" && data.role === "assistant" && ["end_turn", "stop_sequence"].includes(data.stop_reason) : data.status === "completed";
    if (!completed) throw new Error("Incomplete review");
    const text = provider === "anthropic"
      ? (Array.isArray(data.content) ? data.content : []).filter(part => part.type === "text").map(part => part.text).join("\n")
      : (Array.isArray(data.output) ? data.output : []).filter(item => item.type === "message" && item.role === "assistant").flatMap(item => Array.isArray(item.content) ? item.content : []).filter(part => part.type === "output_text").map(part => part.text).join("\n");
    value = JSON.parse(text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""));
  } catch {
    abortIfNeeded(signal);
    throw new HttpError(502, "invalid_evidence_review", "The provider returned an unreadable or incomplete evidence review. Try again.");
  }
  abortIfNeeded(signal);
  const review = normalizeEvidenceReview(value, new Set(sources.map(source => source.id)));
  const warnings = [
    ...scholarly.warnings,
    "Citations identify supplied excerpts; their presence does not verify that a claim is supported. Check the linked source before use.",
    ...(documents.length ? ["Library passages are researcher-supplied and have not been independently verified."] : []),
    ...(!sources.length ? ["No readable sources were retrieved. This review has no cited evidence."] : []),
    ...(review.citationAudit.invalidDropped ? [`${review.citationAudit.invalidDropped} unknown citation IDs were removed.`] : []),
    ...(context.institution?.warnings || []),
  ];
  const content = [
    "Exploratory cited review · AI-generated preparation, not an IRB decision", review.summary,
    ...review.claims.map(claim => `• ${claim.text} ${claim.uncited ? "[Uncited]" : claim.sources.map(id => `[${id}]`).join(" ")}`),
    ...(review.disagreements.length ? ["Unresolved tradeoffs", ...review.disagreements.map(text => `• ${text}`)] : []),
    ...(review.questions.length ? ["Questions to resolve", ...review.questions.map(text => `• ${text}`)] : []),
  ].join("\n\n");
  return { content, sources, review, warnings, provider, model, createdAt: new Date().toISOString() };
}
