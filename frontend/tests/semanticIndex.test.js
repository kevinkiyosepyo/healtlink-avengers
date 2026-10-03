import test from 'node:test'
import assert from 'node:assert/strict'
import { createSemanticIndex, documentsFromSessions, textKey } from '../src/lib/semanticIndex.js'

// Deterministic fake embedder: bag of known words -> 8-dim vector.
const VOCAB = ['clinic', 'health', 'appointment', 'text', 'phone', 'weekend', 'evening', 'community']
function fakeEmbed(texts) {
  fakeEmbed.calls.push(texts)
  return Promise.resolve(texts.map((text) => {
    const words = text.toLowerCase()
    const vector = VOCAB.map((word) => (words.includes(word) ? 1 : 0))
    if (!vector.some(Boolean)) vector[0] = 0.01
    const norm = Math.hypot(...vector)
    return vector.map((value) => value / norm)
  }))
}
fakeEmbed.calls = []

function mapCache() {
  const store = new Map()
  return { get: async (key) => store.get(key), set: async (key, value) => { store.set(key, value) }, store }
}
function session(id, title, prompts = []) {
  return {
    id,
    title,
    messages: prompts.flatMap((content, index) => [
      { id: `u${index}`, role: 'user', content },
      { id: `a${index}`, role: 'assistant', content: 'demo reply about clinic' },
    ]),
  }
}

test('documentsFromSessions indexes titles and user prompts only', () => {
  const docs = documentsFromSessions([session('s1', 'Clinic hours', ['What if evening appointments?'])])
  assert.deepEqual(docs.map((doc) => doc.kind), ['title', 'prompt'])
  assert.equal(docs[1].text, 'What if evening appointments?')
})

test('textKey is stable and length-aware', () => {
  assert.equal(textKey('abc'), textKey('abc'))
  assert.notEqual(textKey('abc'), textKey('abd'))
})

test('query ranks semantically related sessions first', async () => {
  const index = await createSemanticIndex({ embed: fakeEmbed, dimensions: 8 })
  await index.sync([
    session('reminders', 'Reminder channels', ['Compare text and phone appointment reminders']),
    session('hours', 'Opening hours', ['What if the clinic opened evening and weekend?']),
  ])
  const results = await index.query('weekend evening')
  assert.equal(results[0].sessionId, 'hours')
})

test('sync only embeds new or changed text and removes deleted chats', async () => {
  fakeEmbed.calls = []
  const cache = mapCache()
  const index = await createSemanticIndex({ embed: fakeEmbed, cache, dimensions: 8 })
  const sessions = [session('a', 'Clinic', ['health clinic question'])]
  await index.sync(sessions)
  assert.equal(index.size(), 2)
  const callsAfterFirst = fakeEmbed.calls.length

  await index.sync(sessions)
  assert.equal(fakeEmbed.calls.length, callsAfterFirst, 'unchanged sessions are not re-embedded')

  sessions[0].title = 'Community clinic'
  await index.sync(sessions)
  assert.deepEqual(fakeEmbed.calls.at(-1), ['Community clinic'], 'only the renamed title is embedded')

  await index.sync([])
  assert.equal(index.size(), 0)
})

test('embedding cache is reused across index instances', async () => {
  const cache = mapCache()
  const first = await createSemanticIndex({ embed: fakeEmbed, cache, dimensions: 8 })
  await first.sync([session('a', 'Weekend clinic')])
  fakeEmbed.calls = []
  const second = await createSemanticIndex({ embed: fakeEmbed, cache, dimensions: 8 })
  await second.sync([session('a', 'Weekend clinic')])
  assert.equal(fakeEmbed.calls.length, 0)
})

test('empty query or empty index returns no results', async () => {
  const index = await createSemanticIndex({ embed: fakeEmbed, dimensions: 8 })
  assert.deepEqual(await index.query('clinic'), [])
  await index.sync([session('a', 'Clinic')])
  assert.deepEqual(await index.query('   '), [])
})
