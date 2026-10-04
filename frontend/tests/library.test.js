import test from 'node:test'
import assert from 'node:assert/strict'
import { chunkText, createLexicalIndex, createLibrary, createVectorIndex, fuse, hitsToSources, mmr, quantize, terms } from '../src/lib/library.js'

const para = (word, n) => Array.from({ length: n }, (_, i) => `${word} sentence ${i} about retention.`).join(' ')

test('chunks respect paragraphs, stay near the target size and overlap at word boundaries', () => {
  const text = [para('alpha', 20), para('beta', 20), para('gamma', 20)].join('\n\n')
  const chunks = chunkText(text, { target: 400, overlap: 80 })
  assert.ok(chunks.length >= 4)
  for (const c of chunks) assert.ok(c.end - c.start <= 400 + 80, `chunk ${c.index} too long`)
  for (let i = 1; i < chunks.length; i++) assert.ok(chunks[i].start < chunks[i - 1].end, 'consecutive chunks overlap')
  assert.ok(/^\S/.test(text.slice(chunks[1].start)), 'overlap starts on a word')
})

test('chunks record line and page positions; walls of text are split; caps hold', () => {
  const text = 'Page one intro.\n\nStill page one.\n\nPage two starts here with details.'
  const chunks = chunkText(text, { target: 20, overlap: 0, pages: [{ page: 1, start: 0 }, { page: 2, start: text.indexOf('Page two') }] })
  assert.equal(chunks.at(-1).page, 2)
  assert.equal(chunks.at(-1).line, 5)
  assert.ok(chunkText('x'.repeat(5000), { target: 1000, overlap: 0 }).length >= 5)
  assert.equal(chunkText(para('w', 2000), { target: 200, maxChunks: 7 }).length, 7)
  assert.deepEqual(chunkText('   \n\n  '), [])
})

const unit = (values) => { const n = Math.hypot(...values); return values.map((v) => v / n) }

test('int8 quantization preserves cosine scores closely at a quarter of the memory', () => {
  const a = unit(Array.from({ length: 384 }, (_, i) => Math.sin(i)))
  const b = unit(Array.from({ length: 384 }, (_, i) => Math.sin(i + 0.3)))
  const exact = a.reduce((s, v, i) => s + v * b[i], 0)
  const index = createVectorIndex(384)
  const row = index.add(b)
  assert.ok(Math.abs(index.score(Float32Array.from(a), row) - exact) < 0.02)
  assert.equal(quantize(b).q.byteLength, 384, 'one byte per dimension (vs 4 for float32)')
})

test('the vector index grows past its initial capacity without losing rows', () => {
  const index = createVectorIndex(4)
  for (let i = 0; i < 300; i++) index.add(unit([1, i % 3, 0, 0.1]))
  assert.equal(index.size, 300)
  assert.ok(index.score(Float32Array.from(unit([1, 0, 0, 0.1])), 0) > 0.95)
})

test('lexical index finds exact identifiers and weights rare terms higher', () => {
  const lex = createLexicalIndex()
  lex.add(0, 'Registry NCT04862143 enrolled 120 participants')
  lex.add(1, 'Participants missed visits due to travel')
  lex.add(2, 'Participants preferred evening visits')
  assert.deepEqual(lex.search('NCT04862143', 5, () => true).map(([row]) => row), [0])
  const ranked = lex.search('participants travel', 5, () => true)
  assert.equal(ranked[0][0], 1, 'the rare term "travel" decides the ranking')
  assert.deepEqual(terms('Visits visit stress NCT0123'), ['visit', 'visit', 'stress', 'nct0123'])
})

test('rank fusion rewards agreement and boosts remembered passages; MMR diversifies', () => {
  const fused = fuse([[1, 2, 3], [3, 1]])
  assert.equal(fused[0][0], 1)
  const boosted = fuse([[1, 2, 3]], new Map([[3, 3]]))
  assert.equal(boosted[0][0], 3)
  // rows 0 and 1 are near-duplicates; MMR should take 0 then 2
  const sim = (a, b) => ((a === 0 && b === 1) || (a === 1 && b === 0) ? 0.99 : 0.1)
  assert.deepEqual(mmr([[0, 1], [1, 0.98], [2, 0.9]], sim, { k: 2, lambda: 0.5 }), [0, 2])
})

function memoryStore() {
  const data = new Map()
  return { data, get: async (k) => data.get(k), set: async (k, v) => void data.set(k, v), del: async (k) => void data.delete(k), keys: async () => [...data.keys()] }
}
// Fake embedder: dimension 0 = retention/dropout, 1 = budget, 2 = everything else.
const embed = async (texts) => texts.map((t) => unit([/retention|dropout|travel/i.test(t) ? 1 : 0.05, /budget|catering/i.test(t) ? 1 : 0.05, 0.2]))

test('hybrid search: semantic hits, exact-id keyword hits, per-chat memory, compaction on delete', async () => {
  const store = memoryStore()
  const lib = createLibrary({ embed, store, dims: 3 })
  const notes = await lib.addDocument({ name: 'Notes.md', text: `${para('retention', 30)}\n\n${'Catering budget figures for the meeting. '.repeat(30)}` })
  await lib.addDocument({ name: 'Registry.md', text: 'Registry entry NCT04862143 lists the hybrid visit schedule and contact details for the site.' })
  const semantic = await lib.search(['why participants dropout'], { minScore: 0.5 })
  assert.ok(semantic.length && semantic.every((h) => /retention/.test(h.text)))
  const exact = await lib.search(['NCT04862143'], { minScore: 0.99 })
  assert.equal(exact[0].docName, 'Registry.md', 'keyword match found though embeddings are not similar')
  assert.ok(exact[0].lexical > 0)

  const before = await lib.search(['meeting'], { minScore: 0.99, sessionId: 's1' })
  lib.remember('s1', [{ docId: notes.id, chunk: notes.chunks.length - 1 }])
  const after = await lib.search(['meeting'], { minScore: 0.99, sessionId: 's1' })
  assert.ok(after.some((h) => h.remembered), 'remembered passage is boosted in the same chat')
  assert.ok(!before.some((h) => h.remembered))

  const stats = lib.stats()
  assert.equal(stats.vectorBytes, Math.max(256, stats.passages) * 3 + Math.max(256, stats.passages) * 4)
  await lib.removeDocument(notes.id)
  assert.deepEqual((await lib.list()).map((d) => d.name), ['Registry.md'])
  assert.equal(lib.stats().passages, 1, 'index compacted after delete')
  const reopened = createLibrary({ embed, store, dims: 3 })
  assert.equal((await reopened.search(['NCT04862143']))[0].docName, 'Registry.md', 'persists and re-indexes from the store')
  await assert.rejects(lib.addDocument({ name: 'empty', text: '  ' }), /no readable text/)
})

test('hits become clearly labelled, citable sources carrying their signals', () => {
  const [source] = hitsToSources([{ docId: 'd', docName: 'Policy.md', chunkIndex: 0, start: 0, end: 10, line: 1, page: 3, text: 't', score: 0.4, lexical: 2.1, remembered: true }])
  assert.equal(source.kind, 'document')
  assert.match(source.title, /Policy\.md — passage 1 \(p\. 3\)/)
  assert.equal(source.credibility.tier, 'yours')
  assert.match(source.credibility.reasons[1], /keyword match 2\.1 · used earlier in this chat/)
  assert.equal(source.location.page, 3)
})
