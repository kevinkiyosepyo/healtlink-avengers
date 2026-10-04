import { chunkText, createLexicalIndex } from './library.js'
import { normalizeSimulationContext } from './simulationContext.js'

export const RESEARCH_LIBRARY_LIMIT = 12
export const EVIDENCE_HISTORY_LIMIT = 20
const STORE_LIMIT = 1_800_000
const plainText = (value, limit) => typeof value === 'string' ? value.slice(0, limit) : ''

export function researchToolsStorageKey(workspaceKey) {
  if (!workspaceKey) throw new Error('A workspace is required for research tools.')
  return `${workspaceKey}:research-tools.v1`
}

export function safeSourceUrl(value) {
  try {
    const url = new URL(value)
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : null
  } catch { return null }
}

export function normalizeEvidenceResult(raw) {
  if (!raw || typeof raw.content !== 'string' || !raw.content.trim()) throw new Error('The review did not return readable findings. Please try again.')
  const sources = (Array.isArray(raw.sources) ? raw.sources : []).slice(0, 30).filter((source, index, all) =>
    /^S\d+$/.test(source?.id) && all.findIndex(other => other?.id === source.id) === index,
  ).map(source => ({
    id: source.id, title: plainText(source.title, 500) || source.id,
    url: safeSourceUrl(source.url), kind: ['document', 'paper', 'trial', 'institution-policy'].includes(source.kind) ? source.kind : 'source',
    excerpt: plainText(source.excerpt, 4000),
    ...(Number.isInteger(source.lineStart) && source.lineStart > 0 ? { lineStart: source.lineStart } : {}),
    ...(Number.isInteger(source.lineEnd) && source.lineEnd >= source.lineStart ? { lineEnd: source.lineEnd } : {}),
  }))
  const ids = new Set(sources.map(source => source.id))
  const review = raw.review && typeof raw.review === 'object' ? {
    summary: plainText(raw.review.summary, 8000),
    claims: (Array.isArray(raw.review.claims) ? raw.review.claims : []).slice(0, 30).map(claim => {
      const citations = [...new Set((Array.isArray(claim.sources) ? claim.sources : []).filter(id => ids.has(id)))]
      return { text: plainText(claim.text, 4000), sources: citations, uncited: claim.uncited === true || !citations.length }
    }).filter(claim => claim.text),
    disagreements: (Array.isArray(raw.review.disagreements) ? raw.review.disagreements : []).slice(0, 20).map(item => plainText(item, 2000)).filter(Boolean),
    questions: (Array.isArray(raw.review.questions) ? raw.review.questions : []).slice(0, 20).map(item => plainText(item, 2000)).filter(Boolean),
  } : null
  return {
    content: raw.content.slice(0, 30000), sources, review,
    provider: raw.provider === 'anthropic' ? 'anthropic' : 'openai', model: plainText(raw.model, 150),
    warnings: (Array.isArray(raw.warnings) ? raw.warnings : []).slice(0, 20).map(item => plainText(item, 2000)).filter(Boolean),
  }
}

export function normalizeResearchTools(raw) {
  const empty = { version: 1, documents: [], reviews: [] }
  if (!raw || raw.version !== 1) return empty
  let documents = []
  try {
    documents = normalizeSimulationContext({ documents: raw.documents })?.documents || []
  } catch { /* Invalid imported text is not silently repaired or shortened. */ }
  const reviews = []
  for (const entry of (Array.isArray(raw.reviews) ? raw.reviews : []).slice(0, EVIDENCE_HISTORY_LIMIT)) {
    if (!entry || typeof entry.id !== 'string' || typeof entry.sessionId !== 'string' || !Number.isFinite(entry.createdAt)) continue
    try {
      reviews.push({
        ...normalizeEvidenceResult(entry), id: entry.id.slice(0, 120), sessionId: entry.sessionId.slice(0, 120),
        sessionTitle: plainText(entry.sessionTitle, 200), query: plainText(entry.query, 2000), createdAt: entry.createdAt,
        contextDescription: plainText(entry.contextDescription, 1000),
      })
    } catch { /* Keep other saved reviews available if one entry is damaged. */ }
  }
  return { version: 1, documents, reviews }
}

export function addLibraryDocuments(existing, incoming) {
  const additions = []
  for (const document of incoming) {
    if (![...existing, ...additions].some(saved => saved.name === document.name && saved.text === document.text)) additions.push(document)
  }
  const documents = normalizeSimulationContext({ documents: [...existing, ...additions] })?.documents || []
  return documents
}

export function searchLibraryDocuments(documents, query, limit = 8) {
  if (!query.trim()) return []
  const index = createLexicalIndex()
  const passages = documents.flatMap(document => chunkText(document.text).flatMap(chunk => {
    const excerpts = []
    for (let start = chunk.start; start < chunk.end; start += 2000) {
      const end = Math.min(start + 2000, chunk.end)
      excerpts.push({
        documentId: document.id, name: document.name,
        text: document.text.slice(start, end), lineStart: document.text.slice(0, start).split('\n').length,
        lineEnd: document.text.slice(0, end).split('\n').length, kind: document.kind,
      })
    }
    return excerpts
  }))
  passages.forEach((passage, row) => {
    passage.id = `L${row + 1}`
    index.add(row, `${passage.name.replace(/[._/\\-]/g, ' ')} ${passage.text}`)
  })
  const perDocument = new Map()
  const hits = []
  for (const [row] of index.search(query, passages.length, () => true)) {
    const passage = passages[row]
    const count = perDocument.get(passage.documentId) || 0
    if (count >= 3) continue
    perDocument.set(passage.documentId, count + 1)
    hits.push(passage)
    if (hits.length >= limit) break
  }
  return hits
}

export function serializedResearchTools(data) {
  const text = JSON.stringify(data)
  if (text.length > STORE_LIMIT) throw new Error('Research storage is full. Remove an older review or source before saving more.')
  return text
}

export function simulationReviewExport(session, run, evidence = []) {
  const { institutionToken: _token, ...context } = session.context || {}
  return {
    schemaVersion: 1, kind: 'microfish-simulation-review', exportedAt: new Date().toISOString(),
    session: { id: session.id, title: session.title },
    run: { ...run },
    currentStudySetup: context,
    setupNote: 'This is the current study setup. Earlier runs may have used a different setup.',
    messages: session.messages.filter(message => message.runId === run.id).map(message => ({ role: message.role, content: message.content, createdAt: message.createdAt })),
    evidenceReviews: evidence.filter(review => review.sessionId === session.id),
  }
}

export function researchExportMarkdown(record) {
  if (record.kind === 'microfish-simulation-review') {
    const setup = record.currentStudySetup
    return [
      `# ${record.session.title}`, `Status: ${record.run.status}`, `Provider: ${record.run.mode}`, `Model: ${record.run.model || (record.run.mode === 'demo' ? 'No model (demo)' : 'Not returned')}`,
      `Started: ${new Date(record.run.startedAt).toISOString()}`, '## Study setup', record.setupNote,
      setup.overview || '', setup.transcript ? `### Dictation\n${setup.transcript}` : '',
      setup.university ? `University: ${setup.university.name}` : '',
      ...(setup.documents || []).map(document => `### ${document.name}\n${document.text}`),
      ...(setup.institution ? [
        '## University reviewer context',
        `Profile status: ${setup.institution.status || 'Not recorded'}`,
        setup.institution.retrievedAt ? `Sources checked: ${setup.institution.retrievedAt}` : '',
        ...(setup.institution.reviewers || []).map(reviewer => [
          `### ${reviewer.name}`, `Role: ${reviewer.role}`, `Profile type: ${reviewer.kind}`,
          reviewer.background, ...(reviewer.sourceUrls || []).map(url => `Source: ${url}`),
        ].filter(Boolean).join('\n\n')),
        ...(setup.institution.policies || []).map(policy => `### Policy: ${policy.title}\n\n${policy.summary}\n\nSource: ${policy.sourceUrl}`),
        ...(setup.institution.sources || []).map(source => `Official source: ${source.title} — ${source.url}`),
        ...(setup.institution.warnings || []).map(item => `Note: ${item}`),
      ] : []),
      '## Review conversation', ...record.messages.map(message => `### ${message.role === 'user' ? 'Question' : 'Reviewer response'}\n${message.content}`),
      ...(record.evidenceReviews.length ? ['## Evidence reviews', ...record.evidenceReviews.map(researchExportMarkdown)] : []),
    ].filter(Boolean).join('\n\n')
  }
  return [
    `# Evidence review: ${record.query}`, `Created: ${new Date(record.createdAt).toISOString()}`, `Provider: ${record.provider} · ${record.model}`,
    record.contextDescription || '', record.content,
    ...(record.warnings || []).map(warning => `Note: ${warning}`),
    '## Sources', ...(record.sources || []).map(source => [
      `### [${source.id}] ${source.title}`, source.url || 'Uploaded document · not independently verified',
      source.lineStart ? `Extracted text lines ${source.lineStart}–${source.lineEnd || source.lineStart}` : '', source.excerpt,
    ].filter(Boolean).join('\n\n')),
  ].filter(Boolean).join('\n\n')
}
