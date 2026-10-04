import test from 'node:test'
import assert from 'node:assert/strict'
import { transcribeAudio, AUDIO_BODY_LIMIT } from '../server/transcription.js'
import { nodeHandler } from '../server/node.js'
import { createApiHandler } from '../server/handlers.js'
import { settings, sealApiKey, keyCookieName, SESSION_SECONDS } from '../server/security.js'
import { encodeWav } from '../frontend/src/lib/audioWav.js'

const env = { AUTH_URL: 'https://research.example', AUTH_SECRET: 'test-only-secret-with-more-than-thirty-two-characters', AUTH_GOOGLE_ID: 'test-client-id', AUTH_GOOGLE_SECRET: 'test-client-secret' }
const config = settings(env)
const session = { id: 'researcher-one', sid: 'login-one', expiresAt: Math.floor(Date.now() / 1000) + SESSION_SECONDS }
const apiKey = `sk-${'a'.repeat(40)}`
const wav = async (duration = 0.1, rate = 48000) => Buffer.from(await encodeWav([new Float32Array(rate * duration).fill(0.2)], rate).arrayBuffer())
const request = (audio, headers = {}) => new Request(`${config.origin}/api/transcribe`, { method: 'POST', headers: { 'Content-Type': 'audio/wav', ...headers }, body: audio })

test('valid WAV posts authenticated multipart audio to the fixed provider and returns trimmed text', async () => {
  const audio = await wav()
  let calls = 0
  const result = await transcribeAudio(request(audio), { apiKey, fetchImpl: async (url, options) => {
    calls++
    assert.equal(url, 'https://api.openai.com/v1/audio/transcriptions')
    assert.equal(options.method, 'POST')
    assert.equal(options.headers.Authorization, `Bearer ${apiKey}`)
    assert.equal(options.redirect, 'error')
    assert.equal(options.body.get('model'), 'gpt-4o-mini-transcribe')
    assert.equal(options.body.get('response_format'), 'json')
    const file = options.body.get('file')
    assert.equal(file.name, 'dictation.wav')
    assert.equal(file.type, 'audio/wav')
    assert.deepEqual(Buffer.from(await file.arrayBuffer()), audio)
    return Response.json({ text: '  A research study.  ' })
  } })
  assert.equal(calls, 1)
  assert.deepEqual(await result.json(), { text: 'A research study.' })
})

test('malformed WAV headers and invalid durations never reach the provider', async () => {
  const audio = await wav()
  const candidates = [Buffer.alloc(0), Buffer.alloc(43), Buffer.from('Not a WAV recording'), await wav(0.05)]
  const edits = [[0, 'NOPE'], [8, 'NOPE'], [12, 'NOPE'], [36, 'NOPE']]
  for (const [offset, text] of edits) { const candidate = Buffer.from(audio); candidate.write(text, offset); candidates.push(candidate) }
  for (const [offset, value, bytes] of [[4, audio.length, 4], [16, 18, 4], [20, 3, 2], [22, 2, 2], [24, 7999, 4], [24, 96001, 4], [28, 1234, 4], [32, 4, 2], [34, 32, 2], [40, 1, 4]]) {
    const candidate = Buffer.from(audio)
    if (bytes === 4) candidate.writeUInt32LE(value, offset); else candidate.writeUInt16LE(value, offset)
    candidates.push(candidate)
  }
  const tooLong = Buffer.concat([await wav(35, 8000), Buffer.alloc(16000)])
  tooLong.writeUInt32LE(tooLong.length - 8, 4); tooLong.writeUInt32LE(tooLong.length - 44, 40)
  candidates.push(tooLong)
  let calls = 0
  for (const candidate of candidates) await assert.rejects(transcribeAudio(request(candidate), { apiKey, fetchImpl: async () => { calls++ } }), error => error.status === 400 && error.code === 'invalid_audio')
  await assert.rejects(transcribeAudio(request(audio, { 'Content-Type': 'application/json' }), { apiKey, fetchImpl: async () => { calls++ } }), error => error.status === 415)
  assert.equal(calls, 0)
})

test('audio payload limits enforce both declared and streamed sizes before provider requests', async () => {
  let calls = 0
  const options = { apiKey, fetchImpl: async () => { calls++ } }
  await assert.rejects(transcribeAudio(request(await wav(), { 'Content-Length': String(AUDIO_BODY_LIMIT + 1) }), options), error => error.status === 413)
  await assert.rejects(transcribeAudio(request(Buffer.alloc(AUDIO_BODY_LIMIT + 1)), options), error => error.status === 413)
  let cancelled = false
  let chunks = 0
  const body = new ReadableStream({ pull(controller) { chunks++; controller.enqueue(new Uint8Array(1024 * 1024)) }, cancel() { cancelled = true } })
  const streamed = new Request(`${config.origin}/api/transcribe`, { method: 'POST', headers: { 'Content-Type': 'audio/wav' }, body, duplex: 'half' })
  await assert.rejects(transcribeAudio(streamed, options), error => error.status === 413)
  assert.equal(cancelled, true)
  assert.ok(chunks <= 5)
  assert.equal(calls, 0)
})

test('provider failures and invalid transcript payloads are recoverable and never expose upstream response bodies', async () => {
  for (const [status, expected] of [[429, 429], [401, 502], [500, 502]]) {
    await assert.rejects(transcribeAudio(request(await wav()), { apiKey, fetchImpl: async () => new Response('secret upstream detail', { status }) }), error => error.status === expected && !error.message.includes('secret upstream detail'))
  }
  for (const payload of [null, {}, [], { text: 42 }, { text: 'x'.repeat(10001) }]) {
    await assert.rejects(transcribeAudio(request(await wav()), { apiKey, fetchImpl: async () => Response.json(payload) }), error => error.status === 502 && error.code === 'invalid_transcription')
  }
  await assert.rejects(transcribeAudio(request(await wav()), { apiKey, fetchImpl: async () => new Response('not JSON') }), error => error.code === 'invalid_transcription')
  await assert.rejects(transcribeAudio(request(await wav()), { apiKey, fetchImpl: async () => { throw new Error('Private networking detail') } }), error => error.code === 'transcription_unavailable' && !error.message.includes('Private networking detail'))
})

test('the transcription endpoint requires a signed-in account, exact origin, and connected API key', async () => {
  let calls = 0
  const fetchImpl = async () => { calls++; return Response.json({ text: 'Transcribed' }) }
  const body = await wav()
  const cookie = `${keyCookieName(config)}=${await sealApiKey(apiKey, session, config)}`
  const headers = { Origin: config.origin, Cookie: cookie }
  const anonymous = createApiHandler({ env, authenticate: async () => null, fetchImpl })
  assert.equal((await anonymous(request(body, headers))).status, 401)
  const connected = createApiHandler({ env, authenticate: async () => session, fetchImpl })
  assert.equal((await connected(request(body, { Origin: config.origin }))).status, 403)
  assert.equal((await connected(request(body, { ...headers, Origin: 'https://evil.example' }))).status, 403)
  assert.equal((await connected(request(body, { Cookie: cookie }))).status, 403)
  assert.equal(calls, 0)
  assert.equal((await connected(request(body, headers))).status, 200)
  assert.equal(calls, 1)
})

async function throughNode(path, body, headers = {}, streamed = false) {
  let reachedHandler = false
  const handler = nodeHandler(async incoming => { reachedHandler = true; return Response.json({ size: (await incoming.arrayBuffer()).byteLength }) })
  const req = { url: path, method: 'POST', headers: { host: 'research.example', 'content-type': 'audio/wav', ...headers }, socket: {}, once() {} }
  if (streamed) req[Symbol.asyncIterator] = async function * () { yield body.subarray(0, 100); yield body.subarray(100) }
  else req.body = body
  let response
  const outgoingHeaders = new Headers()
  const res = { statusCode: 200, once() {}, setHeader(name, value) { outgoingHeaders.set(name, value) }, end(bytes) { response = new Response(bytes, { status: this.statusCode, headers: outgoingHeaders }) } }
  await handler(req, res)
  return { response, reachedHandler }
}

test('Node transport applies the transcription size limit to buffers, streams, and content length', async () => {
  const permitted = await throughNode('/api/transcribe?source=voice', Buffer.alloc(2 * 1024 * 1024))
  assert.equal(permitted.response.status, 200)
  assert.equal((await permitted.response.json()).size, 2 * 1024 * 1024)
  for (const streamed of [false, true]) {
    const denied = await throughNode('/api/transcribe/', Buffer.alloc(AUDIO_BODY_LIMIT + 1), {}, streamed)
    assert.equal(denied.response.status, 413)
    assert.equal(denied.reachedHandler, false)
  }
  const declared = await throughNode('/api/transcribe', Buffer.alloc(10), { 'content-length': String(AUDIO_BODY_LIMIT + 1) })
  assert.equal(declared.response.status, 413)
  assert.equal(declared.reachedHandler, false)
  const unrelated = await throughNode('/api/openai', Buffer.alloc(100000))
  assert.equal(unrelated.response.status, 413)
})
