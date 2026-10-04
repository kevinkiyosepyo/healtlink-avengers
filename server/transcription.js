import { HttpError, json } from './security.js'

export const AUDIO_BODY_LIMIT = 3 * 1024 * 1024

export async function transcribeAudio(request, { apiKey, fetchImpl = globalThis.fetch }) {
  if (request.headers.get('content-type')?.split(';')[0] !== 'audio/wav') throw new HttpError(415, 'invalid_audio', 'Send a WAV microphone recording.')
  if (Number(request.headers.get('content-length')) > AUDIO_BODY_LIMIT) throw new HttpError(413, 'audio_too_large', 'The audio segment is too large. Record a shorter segment.')
  const chunks = []
  let size = 0
  if (request.body) {
    const reader = request.body.getReader()
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > AUDIO_BODY_LIMIT) { await reader.cancel(); throw new HttpError(413, 'audio_too_large', 'The audio segment is too large.') }
      chunks.push(value)
    }
  }
  const audio = Buffer.concat(chunks)
  if (audio.length < 44 || audio.toString('ascii', 0, 4) !== 'RIFF' || audio.toString('ascii', 8, 12) !== 'WAVE' || audio.toString('ascii', 12, 16) !== 'fmt ' || audio.readUInt32LE(16) !== 16 || audio.readUInt16LE(20) !== 1 || audio.readUInt16LE(22) !== 1 || audio.readUInt16LE(34) !== 16 || audio.toString('ascii', 36, 40) !== 'data') throw new HttpError(400, 'invalid_audio', 'The microphone recording could not be read.')
  const sampleRate = audio.readUInt32LE(24)
  const dataSize = audio.readUInt32LE(40)
  if (audio.readUInt32LE(4) !== audio.length - 8 || audio.readUInt32LE(28) !== sampleRate * 2 || audio.readUInt16LE(32) !== 2 || sampleRate < 8000 || sampleRate > 96000 || dataSize !== audio.length - 44 || dataSize % 2 || dataSize / (sampleRate * 2) > 35 || dataSize < sampleRate / 5) throw new HttpError(400, 'invalid_audio', 'Record an audio segment between 0.1 and 35 seconds.')
  const form = new FormData()
  form.append('file', new Blob([audio], { type: 'audio/wav' }), 'dictation.wav')
  form.append('model', 'gpt-4o-mini-transcribe')
  form.append('response_format', 'json')
  let response
  try {
    response = await fetchImpl('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST', headers: { Authorization: `Bearer ${apiKey}` }, body: form,
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(45000)]), redirect: 'error',
    })
  } catch { throw new HttpError(502, 'transcription_unavailable', 'Dictation could not reach OpenAI. Your recorded segment is available to retry while this dialog stays open.') }
  if (!response.ok) {
    await response.body?.cancel()
    throw new HttpError(response.status === 429 ? 429 : 502, 'transcription_failed', response.status === 429 ? 'OpenAI usage limits were reached. Check API billing, then retry the recording.' : 'OpenAI could not transcribe this recording. Check your connection and API key, then retry.')
  }
  let result
  try { result = await response.json() } catch { throw new HttpError(502, 'invalid_transcription', 'OpenAI returned an unreadable transcript. Retry the recording.') }
  if (typeof result?.text !== 'string' || result.text.length > 10000) throw new HttpError(502, 'invalid_transcription', 'OpenAI returned an invalid transcript. Retry the recording.')
  return json({ text: result.text.trim() })
}
