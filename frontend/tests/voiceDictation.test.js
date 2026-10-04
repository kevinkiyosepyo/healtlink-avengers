import test from 'node:test'
import assert from 'node:assert/strict'
import { createVoiceDictation } from '../src/lib/voiceDictation.js'
function fixture() {
  const instances = [], texts = [], interim = [], states = [], errors = [], timers = new Map(); let nextTimer = 0
  class Recognition { constructor() { instances.push(this) } start() { this.onstart?.() } stop() { this.stopped = true } abort() { this.aborted = true } }
  const controller = createVoiceDictation({ Recognition, onText: text => texts.push(text), onInterim: text => interim.push(text), onState: state => states.push(state), onError: error => errors.push(error), setTimer: callback => { timers.set(++nextTimer, callback); return nextTimer }, clearTimer: id => timers.delete(id) })
  const result = (text, final = true) => Object.assign([{ transcript: text }], { isFinal: final })
  const flush = () => { for (const [id, callback] of [...timers]) { timers.delete(id); callback() } }
  return { controller, instances, texts, interim, states, errors, timers, result, flush }
}
test('continuous dictation emits final segments once and in order', () => {
  const f = fixture(); f.controller.start(); const instance = f.instances[0]
  assert.equal(instance.continuous, true); assert.equal(instance.interimResults, true)
  instance.onresult({ resultIndex: 0, results: [f.result('First sentence'), f.result('Second', false)] })
  instance.onresult({ resultIndex: 1, results: [f.result('First sentence'), f.result('Second sentence')] })
  instance.onresult({ resultIndex: 1, results: [f.result('First sentence'), f.result('Second sentence')] })
  assert.deepEqual(f.texts, ['First sentence', 'Second sentence']); assert.equal(f.interim[0], 'Second'); f.controller.destroy()
})
test('auto reconnect starts a new result index without losing prior speech', () => {
  const f = fixture(); f.controller.start(); f.instances[0].onresult({ results: [f.result('Before reconnect')] }); f.instances[0].onend(); f.flush()
  assert.equal(f.instances.length, 2); f.instances[1].onresult({ results: [f.result('After reconnect')] }); assert.deepEqual(f.texts, ['Before reconnect', 'After reconnect']); f.controller.destroy()
})
test('pause flushes final speech and never restarts until resumed', () => {
  const f = fixture(); f.controller.start(); f.controller.pause(); assert.equal(f.instances[0].stopped, true)
  f.instances[0].onresult({ results: [f.result('Last final words')] }); f.instances[0].onend(); f.flush()
  assert.equal(f.instances.length, 1); assert.equal(f.states.at(-1), 'paused'); assert.deepEqual(f.texts, ['Last final words'])
  f.controller.resume(); assert.equal(f.instances.length, 2); f.controller.stop(); f.instances[1].onend(); f.flush(); assert.equal(f.states.at(-1), 'idle'); assert.equal(f.instances.length, 2)
})
test('permission errors stop reconnects and show an actionable fallback', () => {
  const f = fixture(); f.controller.start(); f.instances[0].onerror({ error: 'not-allowed' }); f.instances[0].onend(); f.flush()
  assert.match(f.errors[0], /permission was denied/); assert.equal(f.instances.length, 1); assert.equal(f.states.at(-1), 'idle')
})
test('cleanup aborts microphone, clears reconnects, and rejects late results', () => {
  const f = fixture(); f.controller.start(); const old = f.instances[0]; old.onend(); f.controller.destroy(); f.flush(); old.onresult({ results: [f.result('Must not append')] })
  assert.equal(f.instances.length, 1); assert.deepEqual(f.texts, [])
  const active = fixture(); active.controller.start(); active.controller.destroy(); assert.equal(active.instances[0].aborted, true)
})
test('unsupported browsers get explicit text fallback', () => {
  const errors = [], states = []; const voice = createVoiceDictation({ Recognition: null, onError: error => errors.push(error), onState: state => states.push(state) })
  assert.equal(voice.supported, false); voice.start(); assert.match(errors[0], /unavailable.*Type or paste/); assert.equal(states.at(-1), 'unsupported')
})
