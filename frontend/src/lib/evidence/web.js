// Secondary web search through OpenAI's built-in web_search tool (Responses
// API) with the researcher's own key. Results are filtered by domain
// credibility before any agent sees them; excluded links are kept for audit.
import { openaiRequest } from "../llm.js";
import { WEB_CREDIBILITY_THRESHOLD, scoreWebSource } from "./credibility.js";

const MAX_WEB_SOURCES = 4;

export function citationsFromResponse(data) {
  const found = new Map();
  for (const item of data?.output ?? []) {
    if (item.type !== "message") continue;
    for (const part of item.content ?? []) {
      const text = part.text ?? "";
      for (const note of part.annotations ?? []) {
        if (note.type !== "url_citation" || !note.url || found.has(note.url)) continue;
        const start = Math.max(0, (note.start_index ?? 0) - 240);
        found.set(note.url, {
          url: note.url,
          title: note.title || note.url,
          snippet: text.slice(start, note.end_index ?? start + 240).replace(/\s+/g, " ").trim(),
        });
      }
    }
  }
  return [...found.values()];
}

export async function searchWeb({ apiKey, model, prompt, fetchImpl = fetch }) {
  const input = `Find authoritative, citable sources on this clinical-research operations question. Prefer government health agencies, regulators, peer-reviewed journals and academic institutions; avoid blogs and vendor marketing.\n\nQuestion: ${prompt}`;
  let data;
  let tool = "web_search";
  try {
    data = await openaiRequest("/responses", { apiKey, fetchImpl, body: { model, input, tools: [{ type: tool }] } });
  } catch (error) {
    if (error.code !== "bad_request") throw error;
    tool = "web_search_preview"; // older model/tool naming
    data = await openaiRequest("/responses", { apiKey, fetchImpl, body: { model, input, tools: [{ type: tool }] } });
  }
  const scored = citationsFromResponse(data).map((hit) => {
    const credibility = scoreWebSource(hit.url);
    return {
      id: `web:${credibility.host}:${hit.url.length}:${hit.title.length}`,
      database: "Web (OpenAI web search)",
      kind: "web",
      title: hit.title,
      authors: [],
      venue: credibility.host,
      venueType: "web",
      year: null,
      doi: null,
      pmid: null,
      nct: null,
      url: hit.url,
      abstract: hit.snippet,
      citations: 0,
      studyTypes: ["web page"],
      retracted: false,
      status: null,
      credibility,
    };
  });
  const usable = scored.filter((s) => s.credibility.score >= WEB_CREDIBILITY_THRESHOLD).sort((a, b) => b.credibility.score - a.credibility.score);
  return {
    tool,
    sources: usable.slice(0, MAX_WEB_SOURCES),
    excluded: [...usable.slice(MAX_WEB_SOURCES), ...scored.filter((s) => s.credibility.score < WEB_CREDIBILITY_THRESHOLD)].map(({ url, title, credibility }) => ({ url, title, credibility })),
  };
}
