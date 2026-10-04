import test from 'node:test'
import assert from 'node:assert/strict'
import {
  addLibraryDocuments, normalizeEvidenceResult, normalizeResearchTools, researchExportMarkdown,
  researchToolsStorageKey, safeSourceUrl, searchLibraryDocuments, serializedResearchTools, simulationReviewExport,
} from '../src/lib/researchTools.js'

const document = (id, text, name = `${id}.md`) => ({ id, name, kind: 'markdown', text })
const evidence = overrides => ({
  content: 'The protocol requires consent [S1].', provider: 'openai', model: 'research-model',
  sources: [{ id: 'S1', title: 'Protocol', url: null, kind: 'document', excerpt: 'Written consent is required.', lineStart: 4, lineEnd: 4 }],
  review: { summary: 'Consent review', claims: [{ text: 'Written consent is required.', sources: ['S1'] }], disagreements: [], questions: [] },
  ...overrides,
})

test('research sources use the supplied account namespace, never a shared legacy library', () => {
  assert.notEqual(researchToolsStorageKey('workspace.account.a'), researchToolsStorageKey('workspace.account.b'))
  assert.notEqual(researchToolsStorageKey('workspace'), researchToolsStorageKey('workspace.account.a'))
  assert.throws(() => researchToolsStorageKey(''), /workspace/)
})

test('source imports deduplicate identical files but preserve versions and reject over-budget packets', () => {
  const first = document('first', 'Consent is required.', 'protocol.md')
  assert.deepEqual(addLibraryDocuments([first], [{ ...first, id: 'duplicate' }]), [first])
  assert.deepEqual(addLibraryDocuments([], [first, { ...first, id: 'duplicate' }]), [first])
  const changed = document('changed', 'Consent requires a signature.', 'protocol.md')
  assert.deepEqual(addLibraryDocuments([first], [changed]), [first, changed])
  assert.throws(() => addLibraryDocuments([], [document('x', 'x'.repeat(40001))]), /40,000/)
  assert.throws(() => addLibraryDocuments([], Array.from({ length: 13 }, (_, i) => document(`${i}`, 'x'))), /12 documents/)
  assert.throws(() => addLibraryDocuments([], Array.from({ length: 4 }, (_, i) => document(`${i}`, 'x'.repeat(40000)))), /120,000/)
})

test('retrieved citations point to real extracted text and do not invent PDF pages', () => {
  const text = '# Protocol\n\nWritten consent is required.\n\nParticipants attend visits weekly.'
  const [hit] = searchLibraryDocuments([{ ...document('p', text), kind: 'pdf' }], 'consent')
  assert.ok(hit.text.includes('Written consent'))
  assert.ok(text.includes(hit.text))
  assert.equal(hit.lineStart, 1)
  assert.equal(hit.lineEnd, text.split('\n').length)
  assert.equal(hit.documentId, 'p')
  assert.equal('page' in hit, false)
  assert.deepEqual(searchLibraryDocuments([document('p', text)], 'xyzunmatched'), [])
  assert.deepEqual(searchLibraryDocuments([document('p', text)], ''), [])
})

test('retrieval caps repeated passages so one long document cannot crowd out other sources', () => {
  const long = Array.from({ length: 20 }, (_, i) => `Consent section ${i}. ${'Consent is recorded in the study file. '.repeat(25)}`).join('\n\n')
  const hits = searchLibraryDocuments([document('long', long), document('short', 'Consent must be voluntary.')], 'consent', 8)
  assert.ok(hits.filter(hit => hit.documentId === 'long').length <= 3)
  assert.ok(hits.some(hit => hit.documentId === 'short'))
  assert.ok(hits.every(hit => hit.text.length <= 2000))
})

test('unbroken extracted text still respects the evidence API passage budget', () => {
  const hits = searchLibraryDocuments([document('a'.repeat(120), 'x'.repeat(39000), 'consent.md')], 'consent')
  assert.ok(hits.length)
  assert.ok(hits.every(hit => hit.text.length <= 2000 && hit.id.length <= 120))
  assert.equal(new Set(hits.map(hit => hit.id)).size, hits.length)
})

test('evidence citation links allow only safe web URLs and unknown citation IDs are marked uncited', () => {
  assert.equal(safeSourceUrl('javascript:alert(1)'), null)
  assert.equal(safeSourceUrl('https://user:password@example.com'), null)
  assert.equal(safeSourceUrl('file:///private/research.txt'), null)
  assert.equal(safeSourceUrl('https://pubmed.ncbi.nlm.nih.gov/123/'), 'https://pubmed.ncbi.nlm.nih.gov/123/')
  const result = normalizeEvidenceResult(evidence({
    sources: [{ id: 'S1', title: 'Policy', kind: 'institution-policy', url: 'javascript:alert(1)' }, { id: 'S1', title: 'Duplicate' }],
    review: { claims: [{ text: 'Unsupported', sources: ['S99'] }, { text: 'Policy', sources: ['S1', 'S1'] }] },
  }))
  assert.equal(result.sources.length, 1)
  assert.equal(result.sources[0].url, null)
  assert.equal(result.sources[0].kind, 'institution-policy')
  assert.equal(result.review.claims[0].uncited, true)
  assert.deepEqual(result.review.claims[1].sources, ['S1'])
  assert.equal(result.review.claims[1].uncited, false)
})

test('saved research data recovers valid reviews without trusting malformed document packets', () => {
  const valid = { ...evidence(), id: 'review', sessionId: 'case', query: 'What consent?', createdAt: 10 }
  const restored = normalizeResearchTools({ version: 1, documents: [{ id: 'broken' }], reviews: [null, { ...valid, content: '' }, valid] })
  assert.equal(restored.documents.length, 0)
  assert.equal(restored.reviews.length, 1)
  assert.equal(restored.reviews[0].id, 'review')
  assert.deepEqual(normalizeResearchTools({ version: 2, documents: [document('a', 'Secret')] }).documents, [])
  assert.throws(() => serializedResearchTools({ text: 'a'.repeat(1_800_000) }), /storage is full/)
})

test('simulation exports retain reviewer text, distinguish current setup, and omit institution authorization tokens', () => {
  const session = {
    id: 'case', title: 'Consent protocol', context: { overview: 'Current revised setup', transcript: 'Study details', documents: [document('p', 'Protocol text')], institutionToken: 'private-token', institution: { status: 'partial', retrievedAt: '2026-10-04T00:00:00Z', reviewers: [{ name: 'Example Reviewer', role: 'Scientific member', kind: 'public-profile', background: 'Public research background', sourceUrls: ['https://example.edu/roster'] }], policies: [{ title: 'Consent policy', summary: 'Consent must precede enrollment.', sourceUrl: 'https://example.edu/consent' }], sources: [{ title: 'IRB roster', url: 'https://example.edu/roster' }], warnings: ['Composite reviewers are fictional.'] } },
    messages: [{ role: 'user', content: 'Review consent', runId: 'one', createdAt: 1 }, { role: 'assistant', content: 'Reviewer notes', runId: 'one', createdAt: 2 }, { role: 'assistant', content: 'Other run', runId: 'two', createdAt: 3 }],
  }
  const record = simulationReviewExport(session, { id: 'one', mode: 'openai', status: 'completed', startedAt: 1, model: 'research-model' }, [])
  const output = JSON.stringify(record)
  assert.ok(!output.includes('private-token'))
  assert.ok(!output.includes('Other run'))
  assert.ok(record.setupNote.includes('Earlier runs'))
  const markdown = researchExportMarkdown(record)
  assert.ok(markdown.includes('Reviewer notes'))
  assert.ok(markdown.includes('Protocol text'))
  assert.ok(markdown.includes('Current revised setup'))
  assert.ok(markdown.includes('Example Reviewer'))
  assert.ok(markdown.includes('Public research background'))
  assert.ok(markdown.includes('https://example.edu/roster'))
  assert.ok(markdown.includes('Consent must precede enrollment.'))
  assert.ok(markdown.includes('2026-10-04T00:00:00Z'))
  assert.ok(markdown.includes('Composite reviewers are fictional.'))
})

test('evidence exports keep the actual source excerpts and unresolved warnings', () => {
  const record = { ...normalizeEvidenceResult(evidence({ warnings: ['Not enough external evidence.'] })), query: 'Consent process', createdAt: 1 }
  const markdown = researchExportMarkdown(record)
  assert.ok(markdown.includes('[S1] Protocol'))
  assert.ok(markdown.includes('Written consent is required.'))
  assert.ok(markdown.includes('Extracted text lines 4–4'))
  assert.ok(markdown.includes('Not enough external evidence.'))
  assert.ok(markdown.includes('not independently verified'))
})
