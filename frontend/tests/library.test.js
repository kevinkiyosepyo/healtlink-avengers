import test from 'node:test'
import assert from 'node:assert/strict'
import { chunkText, createLibrary, hitsToSources, rankChunks } from '../src/lib/library.js'

const para = (word, n) => Array.from({ length: n }, (_, i) => `${word} sentence ${i} about retention.`).join(' ')

test('chunks respect paragraphs, stay near the target size and overlap at word boundaries', () => {
  const text = [para('alpha', 20), para('beta', 20), para('gamma', 20)].join('\n\n')
  const chunks = chunkText(text, { target: 400, overlap: 80 })
  assert.ok(chunks.length >= 4)
  for (const c of chunks) assert.ok(c.end - c.start <= 400 + 80, `chunk ${c.index} too long`)
  for (let i = 1; i < chunks.length; i++) assert.ok(chunks[i].start < chunks[i - 1].end, 'consecutive chunks overlap')
  assert.ok(/^\S/.test(text.slice(chunks[1].start)), 'overlap starts on a word')
  assert.equal(chunks[0].text, text.slice(chunks[0].start, chunks[0].end).replace(/\s+/g, ' ').trim())
})

test('chunks record line and page positions for provenance', () => {
  const text = 'Page one intro.\n\nStill page one.\n\nPage two starts here with details.'
  const pageTwo = text.indexOf('Page two')
  const chunks = chunkText(text, { target: 20, overlap: 0, pages: [{ page: 1, start: 0 }, { page: 2, start: pageTwo }] })
  const last = chunks.at(-1)
  assert.equal(last.page, 2)
  assert.equal(last.line, 5)
  assert.equal(chunks[0].page, 1)
})

test('unpunctuated walls of text are hard-split and the chunk cap is enforced', () => {
  const wall = 'x'.repeat(5000)
  assert.ok(chunkText(wall, { target: 1000, overlap: 0 }).length >= 5)
  assert.equal(chunkText(para('w', 2000), { target: 200, maxChunks: 7 }).length, 7)
  assert.deepEqual(chunkText('   \n\n  '), [])
})

const unit = (i, n = 4) => Array.from({ length: n }, (_, j) => (j === i ? 1 : 0))
const docA = { id: 'a', name: 'Survey.md', chunks: [0, 1, 2, 3].map((i) => ({ index: i, text: `a${i}`, start: i, end: i + 1, line: 1, page: null })), vectors: [unit(0), unit(0), unit(0), unit(1)] }
const docB = { id: 'b', name: 'Policy.md', chunks: [{ index: 0, text: 'b0', start: 0, end: 1, line: 1, page: 3 }], vectors: [unit(0)] }

test('ranking keeps the best passages, caps passages per document and drops weak matches', () => {
  const hits = rankChunks([docA, docB], [unit(0)], { k: 10, perDocument: 2, minScore: 0.5 })
  assert.deepEqual(hits.map((h) => `${h.docId}${h.chunkIndex}`), ['a0', 'a1', 'b0'])
  assert.equal(hits[0].score, 1)
  assert.deepEqual(rankChunks([docA], [unit(2)], { minScore: 0.5 }), [])
})

test('hits become clearly labelled, citable sources with their location', () => {
  const [source] = hitsToSources(rankChunks([docB], [unit(0)]))
  assert.equal(source.kind, 'document')
  assert.equal(source.database, 'Your library')
  assert.match(source.title, /Policy\.md — passage 1 \(p\. 3\)/)
  assert.equal(source.credibility.tier, 'yours')
  assert.ok(source.credibility.reasons[0].includes('not externally verified'))
  assert.equal(source.location.page, 3)
})

test('library adds, persists, searches and removes documents with an injected embedder', async () => {
  const data = new Map()
  const store = { get: async (k) => data.get(k), set: async (k, v) => void data.set(k, v), del: async (k) => void data.delete(k), keys: async () => [...data.keys()] }
  // Fake embedder: retention-related text points one way, everything else another.
  const embed = async (texts) => texts.map((t) => (/retention|dropout/i.test(t) ? [1, 0] : [0, 1]))
  const progress = []
  const lib = createLibrary({ embed, store })
  const doc = await lib.addDocument({ name: 'Notes.md', text: `${para('retention', 40)}\n\n${'Unrelated budget figures for catering. '.repeat(40)}` }, { onProgress: (done, total) => progress.push([done, total]) })
  assert.ok(doc.chunks.length > 1)
  assert.equal(progress.at(-1)[0], progress.at(-1)[1])
  const hits = await lib.search(['participant dropout'], { minScore: 0.5 })
  assert.ok(hits.length >= 1 && hits.every((h) => /retention/.test(h.text)))
  const reopened = createLibrary({ embed, store })
  assert.equal((await reopened.list()).length, 1, 'documents persist in the store')
  await reopened.removeDocument(doc.id)
  assert.deepEqual(await reopened.list(), [])
  await assert.rejects(lib.addDocument({ name: 'empty', text: '  ' }), /no readable text/)
})
