// Scholarly retrieval from open, CORS-enabled APIs (no keys, called straight
// from the browser). Google Scholar has no API and forbids scraping; OpenAlex
// is the open index of the same literature. Semantic Scholar blocks browser
// requests, so it's omitted. Every fetcher normalizes to one Source shape:
//
// { id, database, kind: "paper"|"trial"|"web", title, authors, venue, year,
//   doi, pmid, nct, url, abstract, citations, studyTypes, retracted, status }

const TIMEOUT_MS = 12_000;
const MAX_ABSTRACT = 1200;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Open APIs rate-limit bursts; one retry after a pause covers the common 429.
async function getJson(url, fetchImpl, { retryDelayMs = 1500 } = {}) {
  for (let attempt = 0; ; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetchImpl(url, { signal: controller.signal, headers: { Accept: "application/json" } });
      if (response.status === 429 && attempt === 0) {
        await sleep(retryDelayMs);
        continue;
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } finally {
      clearTimeout(timer);
    }
  }
}

const clean = (text, max = MAX_ABSTRACT) =>
  String(text ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
const bareDoi = (doi) => (doi ? String(doi).replace(/^https?:\/\/(dx\.)?doi\.org\//i, "").toLowerCase() : null);

// OpenAlex stores abstracts as an inverted index: { word: [positions] }.
export function abstractFromInvertedIndex(index) {
  if (!index || typeof index !== "object") return "";
  const words = [];
  for (const [word, positions] of Object.entries(index)) for (const position of positions) words[position] = word;
  return clean(words.filter(Boolean).join(" "));
}

export function normalizeOpenAlex(work) {
  const doi = bareDoi(work.doi);
  return {
    id: `openalex:${String(work.id).split("/").pop()}`,
    database: "OpenAlex",
    kind: "paper",
    title: clean(work.title, 300),
    authors: (work.authorships ?? []).slice(0, 4).map((a) => a.author?.display_name).filter(Boolean),
    venue: work.primary_location?.source?.display_name ?? null,
    venueType: work.primary_location?.source?.type ?? null,
    year: Number(work.publication_year) || null,
    doi,
    pmid: work.ids?.pmid ? String(work.ids.pmid).split("/").pop() : null,
    nct: null,
    url: doi ? `https://doi.org/${doi}` : work.id,
    abstract: abstractFromInvertedIndex(work.abstract_inverted_index),
    citations: Number(work.cited_by_count) || 0,
    studyTypes: [work.type].filter(Boolean),
    retracted: Boolean(work.is_retracted),
    status: null,
  };
}

export function normalizeEuropePmc(result) {
  const doi = bareDoi(result.doi);
  const pmid = result.pmid ?? (result.source === "MED" ? result.id : null);
  return {
    id: `europepmc:${result.source}-${result.id}`,
    database: "Europe PMC",
    kind: "paper",
    title: clean(result.title, 300),
    authors: String(result.authorString ?? "").split(",").slice(0, 4).map((s) => s.trim()).filter(Boolean),
    venue: result.journalInfo?.journal?.title ?? result.bookOrReportDetails?.publisher ?? null,
    venueType: result.source === "PPR" ? "preprint" : "journal",
    year: Number(result.pubYear) || null,
    doi,
    pmid,
    nct: null,
    url: pmid ? `https://pubmed.ncbi.nlm.nih.gov/${pmid}/` : doi ? `https://doi.org/${doi}` : `https://europepmc.org/article/${result.source}/${result.id}`,
    abstract: clean(result.abstractText),
    citations: Number(result.citedByCount) || 0,
    studyTypes: [].concat(result.pubTypeList?.pubType ?? []).map((t) => String(t).toLowerCase()),
    retracted: [].concat(result.pubTypeList?.pubType ?? []).some((t) => /retract/i.test(t)),
    status: null,
  };
}

export function normalizeClinicalTrial(study) {
  const p = study.protocolSection ?? {};
  const nct = p.identificationModule?.nctId;
  return {
    id: `ctgov:${nct}`,
    database: "ClinicalTrials.gov",
    kind: "trial",
    title: clean(p.identificationModule?.briefTitle, 300),
    authors: [p.sponsorCollaboratorsModule?.leadSponsor?.name].filter(Boolean),
    venue: "ClinicalTrials.gov registry",
    venueType: "registry",
    year: Number(String(p.statusModule?.startDateStruct?.date ?? "").slice(0, 4)) || null,
    doi: null,
    pmid: null,
    nct,
    url: `https://clinicaltrials.gov/study/${nct}`,
    abstract: clean(p.descriptionModule?.briefSummary),
    citations: 0,
    studyTypes: [String(p.designModule?.studyType ?? "").toLowerCase(), ...(p.designModule?.phases ?? []).map((ph) => ph.toLowerCase())].filter(Boolean),
    retracted: false,
    status: p.statusModule?.overallStatus ?? null,
    hasResults: Boolean(study.hasResults),
    enrollment: p.designModule?.enrollmentInfo?.count ?? null,
  };
}

export const DATABASES = {
  openalex: {
    label: "OpenAlex",
    url: (q, n) => `https://api.openalex.org/works?search=${encodeURIComponent(q)}&per-page=${n}&filter=has_abstract:true,is_retracted:false`,
    parse: (json) => (json.results ?? []).map(normalizeOpenAlex),
  },
  europepmc: {
    label: "Europe PMC (incl. PubMed)",
    url: (q, n) => `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(`${q} AND HAS_ABSTRACT:Y`)}&format=json&resultType=core&pageSize=${n}`,
    parse: (json) => (json.resultList?.result ?? []).map(normalizeEuropePmc),
  },
  ctgov: {
    label: "ClinicalTrials.gov",
    url: (q, n) => `https://clinicaltrials.gov/api/v2/studies?query.term=${encodeURIComponent(q)}&pageSize=${n}`,
    parse: (json) => (json.studies ?? []).map(normalizeClinicalTrial),
  },
};

function dedupeKey(source) {
  return source.doi || (source.pmid && `pmid:${source.pmid}`) || source.nct || source.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * Run every query against every database. Failures are recorded, not thrown,
 * so one slow API never blocks the deliberation. Returns sources (deduped,
 * retracted removed) plus a per-request log for the provenance tab.
 */
export async function searchScholarly(queries, { perQuery = 4, fetchImpl = fetch, databases = DATABASES, staggerMs = 400, retryDelayMs = 1500 } = {}) {
  const log = [];
  const tasks = [];
  // Databases run in parallel; queries to the same database are staggered.
  for (const [queryIndex, query] of queries.entries()) {
    for (const [key, db] of Object.entries(databases)) {
      const url = db.url(query, perQuery);
      tasks.push(
        sleep(queryIndex * staggerMs)
          .then(() => getJson(url, fetchImpl, { retryDelayMs }))
          .then((json) => {
            const found = db.parse(json);
            log.push({ database: db.label, query, url, ok: true, count: found.length });
            return found.map((source) => ({ ...source, foundBy: { database: key, query } }));
          })
          .catch((error) => {
            log.push({ database: db.label, query, url, ok: false, error: error.name === "AbortError" ? "timed out" : error.message });
            return [];
          }),
      );
    }
  }
  const byKey = new Map();
  let retractedRemoved = 0;
  for (const source of (await Promise.all(tasks)).flat()) {
    if (!source.title) continue;
    if (source.retracted) {
      retractedRemoved++;
      continue;
    }
    const key = dedupeKey(source);
    const existing = byKey.get(key);
    if (!existing) byKey.set(key, { ...source, alsoIn: [] });
    else if (!existing.alsoIn.includes(source.database) && existing.database !== source.database) existing.alsoIn.push(source.database);
  }
  return { sources: [...byKey.values()], log, retractedRemoved };
}
