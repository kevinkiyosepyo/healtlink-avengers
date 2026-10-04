import test from 'node:test'
import assert from 'node:assert/strict'
import { abstractFromInvertedIndex, normalizeClinicalTrial, normalizeEuropePmc, normalizeOpenAlex, searchScholarly } from '../src/lib/evidence/sources.js'
import { relevance, scoreSource, scoreWebSource, WEB_CREDIBILITY_THRESHOLD } from '../src/lib/evidence/credibility.js'
import { citationsFromResponse } from '../src/lib/evidence/web.js'
import { PANEL, buildPack, checkCitations, computeConsensus, runDeliberation } from '../src/lib/evidence/deliberation.js'

const NOW = new Date('2026-10-03T00:00:00Z')
const openAlexWork = (over = {}) => ({
  id: 'https://openalex.org/W1', doi: 'https://doi.org/10.1/ABC', title: 'Remote visits and retention: a randomized controlled trial',
  publication_year: 2023, cited_by_count: 60, type: 'article', is_retracted: false,
  primary_location: { source: { display_name: 'JAMA Network Open', type: 'journal' } },
  authorships: [{ author: { display_name: 'A. Researcher' } }], ids: { pmid: 'https://pubmed.ncbi.nlm.nih.gov/123' },
  abstract_inverted_index: { Remote: [0], visits: [1], improved: [2], retention: [3] }, ...over,
})
const europePmcResult = (over = {}) => ({
  id: '123', source: 'MED', pmid: '123', doi: '10.1/abc', title: 'Remote visits and retention: a randomized controlled trial',
  pubYear: '2023', journalInfo: { journal: { title: 'JAMA Netw Open' } }, pubTypeList: { pubType: ['Randomized Controlled Trial'] },
  citedByCount: 55, abstractText: '<h4>Background</h4>Remote visits improved retention.', authorString: 'Researcher A, Other B', ...over,
})
const ctStudy = { hasResults: true, protocolSection: { identificationModule: { nctId: 'NCT01234567', briefTitle: 'Hybrid visit schedule trial' }, statusModule: { overallStatus: 'COMPLETED', startDateStruct: { date: '2022-03' } }, designModule: { studyType: 'INTERVENTIONAL', phases: ['PHASE3'], enrollmentInfo: { count: 300 } }, sponsorCollaboratorsModule: { leadSponsor: { name: 'Example University' } }, descriptionModule: { briefSummary: 'Compares hybrid and in-person visits.' } } }

test('normalizers map each API to one source shape with resolvable links', () => {
  const oa = normalizeOpenAlex(openAlexWork())
  assert.equal(oa.doi, '10.1/abc')
  assert.equal(oa.url, 'https://doi.org/10.1/abc')
  assert.equal(oa.pmid, '123')
  assert.equal(oa.abstract, 'Remote visits improved retention')
  const ep = normalizeEuropePmc(europePmcResult())
  assert.equal(ep.url, 'https://pubmed.ncbi.nlm.nih.gov/123/')
  assert.equal(ep.abstract, 'Background Remote visits improved retention.')
  assert.deepEqual(ep.studyTypes, ['randomized controlled trial'])
  const ct = normalizeClinicalTrial(ctStudy)
  assert.equal(ct.url, 'https://clinicaltrials.gov/study/NCT01234567')
  assert.equal(ct.year, 2022)
  assert.equal(ct.hasResults, true)
  assert.equal(abstractFromInvertedIndex({ b: [1], a: [0] }), 'a b')
})

test('searchScholarly dedupes across databases, drops retracted work and logs failures', async () => {
  const fetchImpl = async (url) => {
    if (url.includes('openalex')) return { ok: true, json: async () => ({ results: [openAlexWork(), openAlexWork({ id: 'W2', doi: 'https://doi.org/10.9/r', title: 'Retracted', is_retracted: true })] }) }
    if (url.includes('europepmc')) return { ok: true, json: async () => ({ resultList: { result: [europePmcResult()] } }) }
    return { ok: false, status: 503, json: async () => ({}) }
  }
  const { sources, log, retractedRemoved } = await searchScholarly(['remote visits retention'], { fetchImpl, staggerMs: 0, retryDelayMs: 0 })
  assert.equal(sources.length, 1, 'same DOI from OpenAlex and Europe PMC is one source')
  assert.deepEqual(sources[0].alsoIn, ['Europe PMC'])
  assert.equal(retractedRemoved, 1)
  assert.equal(log.find((l) => l.database === 'ClinicalTrials.gov').ok, false)
})

test('credibility rewards strong designs and peer review, penalizes preprints, and explains itself', () => {
  const rct = scoreSource(normalizeEuropePmc(europePmcResult()), NOW)
  const preprint = scoreSource(normalizeEuropePmc(europePmcResult({ source: 'PPR', pubTypeList: { pubType: ['Preprint'] }, citedByCount: 0, title: 'Remote visits pilot' })), NOW)
  assert.ok(rct.score > preprint.score + 20)
  assert.equal(rct.tier, 'high')
  assert.ok(rct.reasons.some((r) => r.includes('randomized controlled trial')))
  assert.ok(preprint.reasons.some((r) => r.includes('preprint')))
  const trial = scoreSource(normalizeClinicalTrial(ctStudy), NOW)
  assert.ok(trial.reasons.some((r) => r.includes('results posted')))
})

test('web sources: agencies and journals pass, unknown domains fall below the threshold', () => {
  assert.ok(scoreWebSource('https://www.fda.gov/guidance/decentralized').score >= WEB_CREDIBILITY_THRESHOLD)
  assert.ok(scoreWebSource('https://www.nejm.org/doi/x').score >= WEB_CREDIBILITY_THRESHOLD)
  assert.ok(scoreWebSource('https://random-blog.example/post').score < WEB_CREDIBILITY_THRESHOLD)
  assert.equal(scoreWebSource('not a url').score, 0)
  const hits = citationsFromResponse({ output: [{ type: 'message', content: [{ text: 'FDA says remote visits are acceptable.', annotations: [{ type: 'url_citation', url: 'https://www.fda.gov/x', title: 'FDA', start_index: 0, end_index: 38 }, { type: 'url_citation', url: 'https://www.fda.gov/x', title: 'dup' }] }] }] })
  assert.equal(hits.length, 1)
  assert.match(hits[0].snippet, /remote visits/)
})

test('citation checks drop ids outside the pack and flag uncited claims', () => {
  const audit = { invalidDropped: 0, uncited: 0 }
  const out = checkCitations([{ text: 'a', sources: ['S1', 'S9'] }, { text: 'b', sources: ['S7'] }], new Set(['S1', 'S2']), audit)
  assert.deepEqual(out[0].sources, ['S1'])
  assert.equal(out[1].uncited, true)
  assert.deepEqual(audit, { invalidDropped: 2, uncited: 1 })
})

test('computed consensus is a confidence-weighted cross-check independent of the model', () => {
  const c = computeConsensus([{ estimate: { value: 10 }, confidence: 1 }, { estimate: { value: 0 }, confidence: 0.25 }, { estimate: { value: Number.NaN }, confidence: 1 }])
  assert.equal(c.n, 2)
  assert.equal(c.weightedMean, 8)
  assert.equal(c.median, 5)
  assert.equal(c.agreement, 0.5)
  assert.equal(computeConsensus([]), null)
})

test('buildPack drops off-topic sources, ranks the rest by credibility and relevance, then appends web', () => {
  const weak = normalizeEuropePmc(europePmcResult({ id: '9', pmid: '9', doi: null, title: 'Editorial on remote visits', pubTypeList: { pubType: ['Editorial'] }, citedByCount: 0 }))
  const strong = normalizeEuropePmc(europePmcResult())
  const offTopic = normalizeEuropePmc(europePmcResult({ id: '8', pmid: '8', doi: '10.8/x', title: 'Insulin pump calibration in type 1 diabetes', abstractText: 'Glycaemic control outcomes.' }))
  const web = [{ id: 'web:1', kind: 'web', title: 'FDA guidance', abstract: '', studyTypes: ['web page'], credibility: scoreWebSource('https://www.fda.gov/g') }]
  const { pack, irrelevantDropped } = buildPack([weak, offTopic, strong], web, ['remote visits retention'])
  assert.equal(irrelevantDropped, 1)
  assert.deepEqual(pack.map((s) => s.sid), ['S1', 'S2', 'S3'])
  assert.equal(pack[0].title, strong.title)
  assert.equal(pack[2].kind, 'web')
})

test('relevance is the share of query terms found in title or abstract', () => {
  const source = { title: 'Remote visits and retention', abstract: 'Hybrid schedules in oncology.' }
  assert.equal(relevance(source, ['remote visits retention']), 1)
  assert.equal(relevance(source, ['remote dosing pharmacokinetics']), 0.33)
  assert.equal(relevance(source, []), 1)
})

test('a 429 from an open API is retried once before giving up', async () => {
  let calls = 0
  const fetchImpl = async () => (++calls === 1 ? { ok: false, status: 429, json: async () => ({}) } : { ok: true, status: 200, json: async () => ({ results: [openAlexWork()] }) })
  const { sources, log } = await searchScholarly(['remote visits'], { fetchImpl, staggerMs: 0, retryDelayMs: 0, databases: { openalex: (await import('../src/lib/evidence/sources.js')).DATABASES.openalex } })
  assert.equal(calls, 2)
  assert.equal(sources.length, 1)
  assert.equal(log[0].ok, true)
})

test('runDeliberation runs plan → retrieval → web → debate → consensus with validated citations', async () => {
  const chat = (payload) => ({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(payload) } }] }) })
  const stages = []
  const fetchImpl = async (url, init) => {
    if (url.includes('openalex')) return { ok: true, json: async () => ({ results: [openAlexWork()] }) }
    if (url.includes('europepmc')) return { ok: true, json: async () => ({ resultList: { result: [] } }) }
    if (url.includes('clinicaltrials')) return { ok: true, json: async () => ({ studies: [ctStudy] }) }
    if (url.endsWith('/responses')) return { ok: true, json: async () => ({ output: [{ type: 'message', content: [{ text: 'See NIH.', annotations: [{ type: 'url_citation', url: 'https://www.nih.gov/a', title: 'NIH' }, { type: 'url_citation', url: 'https://spam.example/b', title: 'spam' }] }] }] }) }
    const name = JSON.parse(init.body).response_format.json_schema.name
    if (name === 'research_plan') return chat({ queries: ['remote visits retention'], metric: 'change in retention', unit: 'percentage points' })
    if (name === 'opening_position') return chat({ position: 'p', estimate: { value: 5, low: 2, high: 8 }, calculation: 'S1: +5pp', claims: [{ text: 'c', sources: ['S1', 'S99'], strength: 'strong' }], confidence: 0.8 })
    if (name === 'rebuttal') return chat({ responses: [{ to: 'trialist', stance: 'partly', point: 'small sample', sources: ['S2'] }], revised_position: 'r', revised_estimate: { value: 4, low: 1, high: 7 }, changed_mind: true, confidence: 0.6 })
    return chat({ decision: 'proceed with a hybrid schedule', recommendation: 'proceed_with_changes', estimate: { value: 4, low: 1, high: 7 }, calculation: 'mean', key_points: [{ text: 'k', sources: ['S1'] }], dissent: [], evidence_gaps: ['no rare-disease data'], confidence: 0.7 })
  }
  const result = await runDeliberation({ apiKey: 'k', model: 'm', prompt: 'remote visits', fetchImpl, onEvent: (e) => stages.push(e.stage), now: () => 0 })
  assert.equal(result.retrieval.irrelevantDropped, 0)
  assert.deepEqual(stages, ['planning', 'retrieving', 'web', 'opening', 'rebuttal', 'consensus', 'done'])
  assert.deepEqual(result.pack.map((s) => [s.sid, s.kind]), [['S1', 'paper'], ['S2', 'trial'], ['S3', 'web']])
  assert.equal(result.web.excluded.length, 1, 'low-credibility web result is excluded but kept for audit')
  assert.equal(result.openings.length, PANEL.length)
  assert.deepEqual(result.openings[0].claims[0].sources, ['S1'])
  assert.equal(result.citationAudit.invalidDropped, PANEL.length, 'S99 dropped from every opening')
  assert.equal(result.computed.weightedMean, 4)
  assert.equal(result.consensus.recommendation, 'proceed_with_changes')
})
