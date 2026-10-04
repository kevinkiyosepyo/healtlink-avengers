/** Browser speech recognition; only final text is handed to the caller, never audio. */
export function createVoiceDictation({
  Recognition = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition,
  onText = () => {}, onInterim = () => {}, onState = () => {}, onError = () => {},
  setTimer = setTimeout, clearTimer = clearTimeout, language = 'en-US',
} = {}) {
  let recognition = null
  let desired = 'idle'
  let timer = null
  let disposed = false
  let sequence = 0
  let emptyRestarts = 0
  const notify = value => { if (!disposed) onState(value) }
  const clearRestart = () => { if (timer !== null) clearTimer(timer); timer = null }

  function begin() {
    if (disposed || desired !== 'recording' || recognition) return
    if (!Recognition) { desired = 'idle'; onError('Voice dictation is unavailable in this browser. Type or paste your study context below.'); notify('unsupported'); return }
    const instance = new Recognition()
    recognition = instance
    const current = ++sequence
    const finalized = new Set()
    let heardText = false
    instance.continuous = true
    instance.interimResults = true
    instance.maxAlternatives = 1
    instance.lang = language
    const valid = () => !disposed && current === sequence && recognition === instance
    instance.onstart = () => { if (valid()) notify('recording') }
    instance.onresult = event => {
      if (!valid()) return
      const final = []
      const interim = []
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i]
        const text = String(result[0]?.transcript || '').trim()
        if (result.isFinal && !finalized.has(i)) {
          finalized.add(i)
          if (text) final.push(text)
        } else if (!result.isFinal && text) interim.push(text)
      }
      if (final.length) { heardText = true; emptyRestarts = 0; onText(final.join(' ')) }
      onInterim(interim.join(' '))
    }
    instance.onerror = event => {
      if (!valid() || event.error === 'aborted' && desired !== 'recording') return
      if (event.error === 'no-speech') return
      desired = 'idle'
      clearRestart()
      const messages = {
        'not-allowed': 'Microphone permission was denied. Allow microphone access in your browser, or type your context below.',
        'service-not-allowed': 'Your browser blocked its speech service. Type your context below or try a browser with speech recognition.',
        'audio-capture': 'No microphone is available. Connect a microphone, or type your context below.',
        network: 'The speech service lost its connection. Your transcript is preserved; start recording again when you are ready.',
        'language-not-supported': 'The speech service does not support this language. Type your context below.',
      }
      onError(messages[event.error] || 'Dictation stopped unexpectedly. Your transcript is preserved; you can start again.')
      notify('idle')
    }
    instance.onend = () => {
      if (!valid()) return
      recognition = null
      onInterim('')
      if (desired === 'recording') {
        if (!heardText && ++emptyRestarts > 6) {
          desired = 'paused'
          onError('Dictation paused after several silent or interrupted sessions. Resume when you are ready; your transcript is preserved.')
          notify('paused')
          return
        }
        notify('reconnecting')
        timer = setTimer(() => { timer = null; begin() }, 400)
      } else notify(desired)
    }
    try { notify('starting'); instance.start() } catch {
      recognition = null
      desired = 'idle'
      onError('The microphone could not start. Check microphone permission and try again, or type your context below.')
      notify('idle')
    }
  }
  function start() { if (disposed || desired === 'recording') return; desired = 'recording'; emptyRestarts = 0; clearRestart(); if (!recognition) begin() }
  function finish(next) {
    desired = next
    clearRestart()
    if (recognition) {
      notify('stopping')
      try { recognition.stop() } catch { recognition = null; notify(next) }
    } else notify(next)
  }
  return {
    supported: Boolean(Recognition), start, resume: start,
    pause: () => finish('paused'), stop: () => finish('idle'),
    destroy() {
      desired = 'idle'; clearRestart(); disposed = true; sequence++
      try { recognition?.abort() } catch { /* Already ended. */ }
      recognition = null
    },
  }
}
