<script setup>
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import { encodeWav } from '../lib/audioWav.js'

const props = defineProps({ active: Boolean, disabled: Boolean, remainingCharacters: { type: Number, default: 40000 } })
const emit = defineEmits(['append', 'busy'])
const state = ref('idle')
const pending = ref(0)
const processing = ref(false)
const error = ref('')
const seconds = ref(0)
const supported = Boolean(globalThis.navigator?.mediaDevices?.getUserMedia && globalThis.AudioWorkletNode && (globalThis.AudioContext || globalThis.webkitAudioContext))
const busy = computed(() => ['requesting', 'recording', 'paused', 'stopping'].includes(state.value) || processing.value || pending.value > 0)
watch(busy, value => emit('busy', value), { immediate: true })
const MAX_QUEUED_SEGMENTS = 6
const BACKPRESSURE_WARNING = 'Dictation is paused while transcription catches up. Resume when the queued audio finishes.'
let stream, context, source, capture, mute, request, captureSampleRate, generation = 0, commandId = 0
const flushRequests = new Map()
let parts = [], samples = 0, queue = []

function flush() {
  const sampleRate = context?.sampleRate || captureSampleRate
  if (!samples || !sampleRate || queue.length >= MAX_QUEUED_SEGMENTS) return
  const count = samples
  const audio = parts
  parts = []; samples = 0
  if (count < sampleRate / 10) return
  let energy = 0
  for (const part of audio) for (const sample of part) energy += sample * sample
  if (Math.sqrt(energy / count) < 0.0005) return
  queue.push({ blob: encodeWav(audio, sampleRate) })
  pending.value = queue.length
  void drain()
}
async function drain() {
  if (processing.value || (error.value && error.value !== BACKPRESSURE_WARNING) || !queue.length) return
  const currentGeneration = generation
  processing.value = true
  try {
    while (queue.length && currentGeneration === generation) {
      const segment = queue[0]
      if (segment.text === undefined) {
        request = new AbortController()
        const response = await fetch('/api/transcribe', {
          method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'audio/wav' }, body: segment.blob,
          signal: AbortSignal.any([request.signal, AbortSignal.timeout(55000)]),
        })
        let data
        try { data = await response.json() } catch { /* Keep the audio for retry. */ }
        if (!response.ok || typeof data?.text !== 'string') throw new Error(data?.error || 'Transcription failed. Your audio is kept here so you can retry.')
        segment.text = data.text.trim()
      }
      if (currentGeneration !== generation) return
      if (segment.text && segment.text.length + 1 > props.remainingCharacters) throw new Error('The transcript limit was reached. Shorten the editable transcript, then retry to add this segment.')
      if (segment.text) emit('append', segment.text)
      queue.shift()
      // The final capture flush may be waiting behind the bounded upload queue.
      if (state.value !== 'recording') flush()
      pending.value = queue.length
      // Allow the parent to update the remaining transcript capacity.
      await nextTick()
    }
    if (currentGeneration === generation && error.value === BACKPRESSURE_WARNING) error.value = ''
  } catch (cause) {
    if (currentGeneration === generation) {
      error.value = cause.name === 'TimeoutError' ? 'Transcription timed out. Your audio is kept here for retry.' : cause.message
      if (state.value === 'recording') await pause()
    }
  } finally {
    if (currentGeneration === generation) { processing.value = false; request = null }
  }
}
async function flushCapture(command) {
  if (!capture) return
  const currentGeneration = generation
  const currentCapture = capture
  const requestId = ++commandId
  const acknowledged = await new Promise(resolve => {
    const finish = value => {
      clearTimeout(timer)
      flushRequests.delete(requestId)
      resolve(value)
    }
    const timer = setTimeout(() => finish(false), 1000)
    flushRequests.set(requestId, finish)
    currentCapture.port.postMessage({ command, requestId })
  })
  if (generation !== currentGeneration || capture !== currentCapture) return
  flush()
  if (!acknowledged) error.value = 'The microphone did not finish sending its last audio segment. Review the transcript before continuing.'
}
function closeMicrophone() {
  for (const finish of flushRequests.values()) finish(false)
  stream?.getTracks().forEach(track => track.stop())
  source?.disconnect(); capture?.disconnect(); mute?.disconnect()
  if (capture) capture.port.onmessage = null
  void context?.close().catch(() => {})
  stream = context = source = capture = mute = null
}
async function start() {
  if (props.disabled || !props.active || !supported || busy.value) return
  error.value = ''
  state.value = 'requesting'
  const currentGeneration = ++generation
  try {
    const media = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true }, video: false })
    if (generation !== currentGeneration) { media.getTracks().forEach(track => track.stop()); return }
    stream = media
    const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext
    context = new AudioContextClass({ sampleRate: 48000 })
    if (context.sampleRate < 8000 || context.sampleRate > 96000) throw new Error('Unsupported microphone sample rate')
    captureSampleRate = context.sampleRate
    await context.audioWorklet.addModule('/audio-capture-worklet.js')
    if (generation !== currentGeneration) return
    await context.resume()
    if (generation !== currentGeneration) return
    source = context.createMediaStreamSource(stream)
    capture = new AudioWorkletNode(context, 'microfish-capture')
    mute = context.createGain(); mute.gain.value = 0
    capture.port.onmessage = ({ data }) => {
      if (generation !== currentGeneration) return
      if (data.samples) {
        parts.push(data.samples); samples += data.samples.length
        seconds.value += data.samples.length / context.sampleRate
        if (samples >= Math.min(context.sampleRate * 20, 480000)) flush()
        // Reserve the final queue slot for samples flushed by the pause command.
        if (queue.length >= MAX_QUEUED_SEGMENTS - 1 && state.value === 'recording') {
          error.value = BACKPRESSURE_WARNING
          void pause()
        }
      }
      if (data.flushed !== undefined) flushRequests.get(data.flushed)?.(true)
    }
    source.connect(capture); capture.connect(mute); mute.connect(context.destination)
    state.value = 'recording'
  } catch (cause) {
    if (generation !== currentGeneration) return
    error.value = cause.name === 'NotAllowedError' ? 'Microphone access was denied. Allow microphone access and try again.' : 'The microphone could not start. Check its permissions or use browser dictation.'
    closeMicrophone(); state.value = 'idle'
  }
}
async function pause() {
  if (state.value !== 'recording') return
  const currentGeneration = generation
  state.value = 'paused'
  await flushCapture('pause')
  if (generation !== currentGeneration || state.value !== 'paused') return
  stream?.getAudioTracks().forEach(track => { track.enabled = false })
}
function resume() {
  if (state.value !== 'paused' || props.disabled || error.value || !capture) return
  stream?.getAudioTracks().forEach(track => { track.enabled = true })
  capture.port.postMessage('resume')
  state.value = 'recording'
}
async function stop() {
  if (!['recording', 'paused'].includes(state.value)) return
  const currentGeneration = generation
  state.value = 'stopping'
  await flushCapture('stop')
  if (generation !== currentGeneration) return
  closeMicrophone()
  state.value = 'stopped'
}
function retry() { error.value = ''; void drain() }
function discard() {
  generation++; request?.abort()
  queue = []; parts = []; samples = 0
  captureSampleRate = null
  pending.value = 0; processing.value = false; error.value = ''
  closeMicrophone(); state.value = 'stopped'
}
watch(() => props.active, active => { if (!active) discard() })
onUnmounted(discard)
</script>

<template>
  <div class="provider-dictation">
    <p>OpenAI dictation sends short audio segments to your connected OpenAI account. Usage is billed to that account. Audio is held in memory only; review the transcript before creating your simulation.</p>
    <p v-if="!supported" role="status">This browser cannot access microphone dictation. You can type or paste a transcript below.</p>
    <template v-else>
      <div class="provider-dictation-controls">
        <button v-if="['idle', 'stopped'].includes(state)" type="button" :disabled="disabled || busy" @click="start">Start OpenAI dictation</button>
        <button v-if="state === 'recording'" type="button" @click="pause">Pause recording</button>
        <button v-if="state === 'paused'" type="button" :disabled="disabled || Boolean(error)" @click="resume">Resume recording</button>
        <button v-if="['recording', 'paused'].includes(state)" type="button" @click="stop">Stop recording</button>
        <span role="status">{{ state === 'recording' ? '● Recording' : state === 'requesting' ? 'Waiting for microphone…' : state === 'paused' ? 'Paused' : processing ? 'Transcribing…' : 'Ready' }} · {{ Math.floor(seconds / 60) }}:{{ String(Math.floor(seconds % 60)).padStart(2, '0') }}</span>
      </div>
      <p v-if="pending">{{ pending }} audio {{ pending === 1 ? 'segment' : 'segments' }} waiting for transcription. Keep this dialog open.</p>
      <p v-if="error" class="provider-voice-error" role="alert">{{ error }}</p>
      <div v-if="error && pending" class="provider-dictation-controls">
        <button type="button" :disabled="processing" @click="retry">Retry transcription</button>
        <button type="button" @click="discard">Discard untranscribed audio</button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.provider-dictation { padding: 14px; background: var(--ui-surface-alt, #f8fafc); border: 1px solid var(--ui-border, #dce1e7); border-radius: 10px; }
p { font-size: .8rem; line-height: 1.6; color: var(--ui-muted, #5d616b); margin: 0 0 12px; }
.provider-dictation-controls { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
button { min-height: 42px; padding: 8px 12px; border: 1px solid var(--ui-control-border, #737986); border-radius: 7px; color: var(--ui-text, #1d1d1f); background: var(--ui-surface, #fff); cursor: pointer; font-size: .8rem; }
button:disabled { opacity: .6; cursor: not-allowed; }
button:focus-visible { outline: 2px solid var(--ui-accent, #2457d6); outline-offset: 3px; }
span { font-size: .8rem; }
.provider-voice-error { color: var(--ui-danger, #963e30); margin-top: 12px; }
</style>
