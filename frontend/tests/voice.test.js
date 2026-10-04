import test from 'node:test'
import assert from 'node:assert/strict'
import { appendSegment, cleanTranscript, consensusScript, transcribeSegment } from '../src/lib/voice.js'

test('fillers are dropped, spoken punctuation converted and sentences capitalized', () => {
  assert.deepEqual(cleanTranscript('um so what happens if we uh cut visits comma especially at site three question mark'), {
    text: 'So what happens if we cut visits, especially at site three?',
    command: null,
  })
  assert.equal(cleanTranscript('first point period new line second point').text, 'First point.\nSecond point')
})

test('"scratch that" removes the clause spoken just before it', () => {
  assert.equal(cleanTranscript('Make week two remote, actually week four scratch that keep labs in person').text, 'Make week two remote, keep labs in person')
  assert.equal(cleanTranscript('Drop the visit scratch that. Add an evening slot').text, 'Add an evening slot')
})

test('a trailing "run it" becomes a send command and is removed from the text', () => {
  assert.deepEqual(cleanTranscript('what if consent moves online run it'), { text: 'What if consent moves online', command: 'send' })
  assert.equal(cleanTranscript('should we run it at two sites').command, null, '"run it" mid-sentence is just words')
})

test('segments join onto the draft with sensible spacing', () => {
  assert.equal(appendSegment('', 'Hello'), 'Hello')
  assert.equal(appendSegment('Hello ', 'world'), 'Hello world')
  assert.equal(appendSegment('Line one\n', 'line two'), 'Line one\nline two')
  assert.equal(appendSegment('Keep', ''), 'Keep')
})

test('transcription sends audio with domain hints and falls back to whisper-1', async () => {
  const calls = []
  const fetchImpl = async (url, init) => {
    calls.push(init.body.get('model'))
    if (init.body.get('model') !== 'whisper-1') return { ok: false, status: 400, json: async () => ({}) }
    return { ok: true, status: 200, json: async () => ({ text: 'retention at site three' }) }
  }
  const text = await transcribeSegment(new Blob(['x'], { type: 'audio/webm' }), { apiKey: 'k', fetchImpl })
  assert.equal(text, 'retention at site three')
  assert.deepEqual(calls, ['gpt-4o-mini-transcribe', 'whisper-1'])
  await assert.rejects(transcribeSegment(new Blob(['x']), { apiKey: 'k', fetchImpl: async () => ({ ok: false, status: 401 }) }), (e) => e.code === 'auth')
})

test('the spoken consensus summary reads naturally and omits citation ids', () => {
  const script = consensusScript({ metric: { name: 'change in retention', unit: 'percentage points' }, consensus: { recommendation: 'proceed_with_changes', decision: 'Make week 2 remote.', estimate: { value: 4, low: 1, high: 7 }, key_points: [{ text: 'Hybrid schedules cut dropout.', sources: ['S1'] }] } })
  assert.equal(script, 'Proceed with changes. Make week 2 remote. Estimated change in retention: 4 percentage points, ranging from 1 to 7. Hybrid schedules cut dropout.')
  assert.ok(!script.includes('S1'))
})
