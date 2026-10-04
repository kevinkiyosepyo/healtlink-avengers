import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { encodeWav } from '../src/lib/audioWav.js'

test('WAV encoding writes exact mono PCM headers and preserves sample ordering across parts', async () => {
  const audio = encodeWav([new Float32Array([-2, -1, -0.5]), new Float32Array([0, 0.5, 1, 2, NaN, Infinity])], 48000)
  assert.equal(audio.type, 'audio/wav')
  const bytes = Buffer.from(await audio.arrayBuffer())
  assert.equal(bytes.toString('ascii', 0, 4), 'RIFF')
  assert.equal(bytes.readUInt32LE(4), bytes.length - 8)
  assert.equal(bytes.toString('ascii', 8, 12), 'WAVE')
  assert.equal(bytes.toString('ascii', 12, 16), 'fmt ')
  assert.equal(bytes.readUInt32LE(16), 16)
  assert.equal(bytes.readUInt16LE(20), 1)
  assert.equal(bytes.readUInt16LE(22), 1)
  assert.equal(bytes.readUInt32LE(24), 48000)
  assert.equal(bytes.readUInt32LE(28), 96000)
  assert.equal(bytes.readUInt16LE(32), 2)
  assert.equal(bytes.readUInt16LE(34), 16)
  assert.equal(bytes.toString('ascii', 36, 40), 'data')
  assert.equal(bytes.readUInt32LE(40), bytes.length - 44)
  assert.deepEqual(Array.from({ length: 9 }, (_, index) => bytes.readInt16LE(44 + index * 2)), [-32768, -32768, -16384, 0, 16383, 32767, 32767, 0, 0])
})

test('WAV encoding rejects unsupported rates, invalid sample containers, and unbounded audio', () => {
  for (const rate of [0, 7999, 96001, 48000.5, NaN, Infinity, '48000']) assert.throws(() => encodeWav([], rate), /sample rate/)
  for (const parts of [null, {}, [[0.2]], [new Uint16Array(10)]]) assert.throws(() => encodeWav(parts, 48000), /Float32Array/)
  assert.throws(() => encodeWav([new Float32Array(8000 * 35 + 1)], 8000), /35 seconds/)
})

test('audio worklet flushes samples before each matching pause or stop acknowledgement', async () => {
  const posted = []
  let Processor
  const sandbox = {
    Float32Array,
    AudioWorkletProcessor: class { constructor() { this.port = { postMessage: message => posted.push(message) } } },
    registerProcessor: (name, value) => { assert.equal(name, 'microfish-capture'); Processor = value },
  }
  vm.runInNewContext(await readFile(new URL('../public/audio-capture-worklet.js', import.meta.url), 'utf8'), sandbox)
  const processor = new Processor()
  processor.process([[new Float32Array([0.1, 0.2, 0.3])]])
  processor.port.onmessage({ data: { command: 'pause', requestId: 11 } })
  assert.equal(posted[0].samples.length, 3)
  assert.equal(posted[1].flushed, 11)
  processor.process([[new Float32Array([0.4])]])
  assert.equal(posted.length, 2)
  processor.port.onmessage({ data: 'resume' })
  processor.process([[new Float32Array([0.5])]])
  processor.port.onmessage({ data: { command: 'stop', requestId: 12 } })
  assert.equal(posted[2].samples.length, 1)
  assert.equal(posted[2].samples[0], 0.5)
  assert.equal(posted[3].flushed, 12)
})

const settle = async () => { await new Promise(resolve => setImmediate(resolve)); await nextTick() }
const ok = text => ({ ok: true, json: async () => ({ text }) })

async function providerHarness({ autoAck = true, remainingCharacters = 40000 } = {}) {
  const code = (await readFile(new URL('../src/components/ProviderDictation.vue', import.meta.url), 'utf8')).match(/<script setup>([\s\S]*?)<\/script>/)[1].replace(/^import .*$/gm, '')
  const props = reactive({ active: true, disabled: false, remainingCharacters })
  const tracks = [], contexts = [], captures = [], calls = [], emitted = [], watchers = [], disposals = []
  class FakeAudioContext {
    constructor() { this.sampleRate = 48000; this.audioWorklet = { addModule: async () => {} }; contexts.push(this) }
    resume() { return Promise.resolve() }
    close() { this.closed = true; return Promise.resolve() }
    createMediaStreamSource() { return { connect() {}, disconnect() {} } }
    createGain() { return { gain: {}, connect() {}, disconnect() {} } }
  }
  class FakeCapture {
    constructor() {
      this.commands = []
      this.port = { onmessage: null, postMessage: command => {
        this.commands.push(command)
        if (autoAck && command.requestId) queueMicrotask(() => this.port.onmessage?.({ data: { flushed: command.requestId } }))
      } }
      captures.push(this)
    }
    connect() {}
    disconnect() {}
    audio(count = 480000) { this.port.onmessage?.({ data: { samples: new Float32Array(count).fill(0.2) } }) }
  }
  const sandbox = {
    computed, ref, nextTick, encodeWav, Float32Array, AbortController, AbortSignal, setTimeout, clearTimeout,
    watch: (...args) => { const stop = watch(...args); watchers.push(stop); return stop },
    onUnmounted: callback => disposals.push(callback),
    defineProps: () => props,
    defineEmits: () => (type, value) => {
      emitted.push({ type, value })
      if (type === 'append') props.remainingCharacters -= value.length + 1
    },
    navigator: { mediaDevices: { getUserMedia: async () => {
      const track = { enabled: true, stopped: false, stop() { this.stopped = true } }
      tracks.push(track)
      return { getTracks: () => [track], getAudioTracks: () => [track] }
    } } },
    AudioContext: FakeAudioContext, AudioWorkletNode: FakeCapture,
    fetch: (url, options) => new Promise((resolve, reject) => calls.push({ url, options, resolve, reject })),
  }
  vm.runInNewContext(`${code}\nglobalThis.api = { start, pause, resume, stop, retry, discard, get state() { return state.value }, get error() { return error.value }, get pending() { return pending.value }, get processing() { return processing.value } }`, sandbox)
  return { props, api: sandbox.api, tracks, contexts, captures, calls, emitted,
    dispose() { for (const callback of disposals) callback(); for (const stop of watchers) stop() },
  }
}

test('pending stop cannot close a replacement recording after discard and restart', async () => {
  const h = await providerHarness({ autoAck: false })
  try {
    await h.api.start()
    const stopping = h.api.stop()
    h.api.discard()
    const restarting = h.api.start()
    await stopping
    await restarting
    assert.equal(h.api.state, 'recording')
    assert.equal(h.tracks[0].stopped, true)
    assert.equal(h.tracks[1].stopped, false)
    assert.equal(h.tracks[1].enabled, true)
    assert.notEqual(h.contexts[1].closed, true)
  } finally { h.dispose() }
})

test('rapid pause and stop keep separate acknowledgements and close the original microphone', async () => {
  const h = await providerHarness({ autoAck: false })
  try {
    await h.api.start()
    const pausing = h.api.pause()
    const stopping = h.api.stop()
    const [pauseCommand, stopCommand] = h.captures[0].commands
    assert.notEqual(pauseCommand.requestId, stopCommand.requestId)
    h.captures[0].port.onmessage({ data: { flushed: pauseCommand.requestId } })
    await pausing
    assert.equal(h.api.state, 'stopping')
    h.captures[0].port.onmessage({ data: { flushed: stopCommand.requestId } })
    await stopping
    assert.equal(h.api.state, 'stopped')
    assert.equal(h.tracks[0].stopped, true)
  } finally { h.dispose() }
})

test('provider transcripts stay ordered and closing the dialog discards late results', async () => {
  const h = await providerHarness()
  try {
    await h.api.start()
    h.captures[0].audio()
    h.captures[0].audio()
    assert.equal(h.calls.length, 1)
    assert.equal(h.calls[0].options.headers['Content-Type'], 'audio/wav')
    assert.equal(h.calls[0].options.credentials, 'same-origin')
    h.calls[0].resolve(ok('First segment'))
    await settle()
    assert.equal(h.calls.length, 2)
    assert.deepEqual(h.emitted.filter(entry => entry.type === 'append').map(entry => entry.value), ['First segment'])
    h.props.active = false
    await nextTick()
    assert.equal(h.calls[1].options.signal.aborted, true)
    assert.equal(h.tracks[0].stopped, true)
    h.calls[1].resolve(ok('Late segment'))
    await settle()
    assert.equal(h.api.pending, 0)
    assert.deepEqual(h.emitted.filter(entry => entry.type === 'append').map(entry => entry.value), ['First segment'])
  } finally { h.dispose() }
})

test('backpressure pauses with bounded uploads and allows resume after the queue drains', async () => {
  const h = await providerHarness()
  try {
    await h.api.start()
    for (let index = 0; index < 5; index++) h.captures[0].audio()
    await settle()
    assert.equal(h.api.state, 'paused')
    assert.ok(h.api.pending <= 6)
    assert.match(h.api.error, /catches up/)
    for (let index = 0; index < 5; index++) {
      assert.equal(h.calls.length, index + 1)
      h.calls[index].resolve(ok(`Segment ${index + 1}`))
      await settle()
    }
    assert.equal(h.api.pending, 0)
    assert.equal(h.api.error, '')
    h.api.resume()
    assert.equal(h.api.state, 'recording')
    assert.equal(h.tracks[0].enabled, true)
  } finally { h.dispose() }
})

test('transcription errors preserve queued audio for retry and full transcripts retain unappended text', async () => {
  const h = await providerHarness({ remainingCharacters: 4 })
  try {
    await h.api.start()
    h.captures[0].audio()
    h.calls[0].reject(new Error('Network failed'))
    await settle()
    assert.equal(h.api.state, 'paused')
    assert.equal(h.api.pending, 1)
    assert.match(h.api.error, /Network failed/)
    h.api.retry()
    assert.equal(h.calls.length, 2)
    assert.equal(h.calls[1].options.body, h.calls[0].options.body)
    h.calls[1].resolve(ok('Five!'))
    await settle()
    assert.match(h.api.error, /transcript limit/)
    assert.equal(h.api.pending, 1)
    assert.equal(h.emitted.some(entry => entry.type === 'append'), false)
    h.props.remainingCharacters = 100
    h.api.retry()
    await settle()
    assert.equal(h.calls.length, 2, 'retrying retained text must not charge for another transcription')
    assert.equal(h.api.pending, 0)
    assert.deepEqual(h.emitted.filter(entry => entry.type === 'append').map(entry => entry.value), ['Five!'])
  } finally { h.dispose() }
})
