export function encodeWav(parts, sampleRate) {
  if (!Number.isInteger(sampleRate) || sampleRate < 8000 || sampleRate > 96000) throw new Error('Use a microphone sample rate between 8,000 and 96,000 Hz.')
  if (!Array.isArray(parts) || parts.some(part => !(part instanceof Float32Array))) throw new Error('Microphone audio must contain Float32Array samples.')
  const size = parts.reduce((sum, part) => sum + part.length, 0)
  if (size > sampleRate * 35) throw new Error('Keep microphone segments shorter than 35 seconds.')
  const buffer = new ArrayBuffer(44 + size * 2)
  const data = new DataView(buffer)
  const text = (offset, value) => [...value].forEach((char, i) => data.setUint8(offset + i, char.charCodeAt(0)))
  text(0, 'RIFF'); data.setUint32(4, 36 + size * 2, true); text(8, 'WAVE'); text(12, 'fmt ')
  data.setUint32(16, 16, true); data.setUint16(20, 1, true); data.setUint16(22, 1, true)
  data.setUint32(24, sampleRate, true); data.setUint32(28, sampleRate * 2, true); data.setUint16(32, 2, true); data.setUint16(34, 16, true)
  text(36, 'data'); data.setUint32(40, size * 2, true)
  let offset = 44
  for (const part of parts) for (const raw of part) {
    const sample = Math.max(-1, Math.min(1, Number.isFinite(raw) ? raw : 0))
    data.setInt16(offset, sample < 0 ? sample * 32768 : sample * 32767, true)
    offset += 2
  }
  return new Blob([buffer], { type: 'audio/wav' })
}
