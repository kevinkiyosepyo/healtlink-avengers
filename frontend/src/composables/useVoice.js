import { onBeforeUnmount, ref } from "vue";
import { speak as speakText, stopSpeaking as stopSpeech, transcribeSegment } from "../lib/voice.js";

// Pause detection on microphone levels: speech starts above SPEECH_RMS; a
// segment ends after SILENCE_MS of quiet (or MAX_SEGMENT_MS), so text arrives
// while the researcher keeps talking.
const SPEECH_RMS = 0.025;
const SILENCE_MS = 900;
const MAX_SEGMENT_MS = 25_000;

/**
 * Continuous dictation. Engines:
 *   "openai"  — segments recorded locally, transcribed with the researcher's key;
 *   "browser" — the browser's built-in speech recognition (Chrome sends audio to
 *               Google, Safari to Apple), used when no key is set up.
 * `onSegment(text)` receives each finished raw segment.
 */
export function useVoice({ getApiKey }) {
  const listening = ref(false);
  const engine = ref(null);
  const interim = ref("");
  const error = ref("");
  const pending = ref(0); // segments being transcribed
  let stopCurrent = null;

  const browserRecognition = typeof window !== "undefined" ? window.SpeechRecognition || window.webkitSpeechRecognition : null;
  const canRecord = typeof window !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);

  async function startOpenAi(apiKey, onSegment) {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    const audio = new AudioContext();
    const analyser = audio.createAnalyser();
    analyser.fftSize = 1024;
    audio.createMediaStreamSource(stream).connect(analyser);
    const samples = new Float32Array(analyser.fftSize);
    const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((type) => MediaRecorder.isTypeSupported(type));

    let recorder = null;
    let chunks = [];
    let spoke = false;
    let lastVoice = 0;
    let segmentStart = 0;
    let frame = 0;
    let stopped = false;

    function beginSegment() {
      chunks = [];
      spoke = false;
      segmentStart = performance.now();
      recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorder.ondataavailable = (event) => event.data.size && chunks.push(event.data);
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: recorder.mimeType });
        if (spoke && blob.size > 2000) {
          pending.value++;
          transcribeSegment(blob, { apiKey })
            .then((text) => text.trim() && onSegment(text))
            .catch((cause) => (error.value = cause.code === "auth" ? "openai rejected the key for transcription." : "a dictation segment couldn't be transcribed."))
            .finally(() => pending.value--);
        }
        if (!stopped) beginSegment();
      };
      recorder.start();
    }
    function tick() {
      analyser.getFloatTimeDomainData(samples);
      let sum = 0;
      for (const v of samples) sum += v * v;
      const now = performance.now();
      if (Math.sqrt(sum / samples.length) > SPEECH_RMS) {
        spoke = true;
        lastVoice = now;
        interim.value = "listening…";
      }
      const quietFor = now - lastVoice;
      if (recorder?.state === "recording" && ((spoke && quietFor > SILENCE_MS) || now - segmentStart > MAX_SEGMENT_MS)) {
        interim.value = "";
        recorder.stop();
      }
      frame = requestAnimationFrame(tick);
    }
    beginSegment();
    tick();
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      if (recorder?.state === "recording") recorder.stop();
      stream.getTracks().forEach((track) => track.stop());
      audio.close();
    };
  }

  function startBrowser(onSegment) {
    const recognition = new browserRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = navigator.language || "en-US";
    let stopped = false;
    recognition.onresult = (event) => {
      let partial = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) onSegment(result[0].transcript);
        else partial += result[0].transcript;
      }
      interim.value = partial;
    };
    recognition.onerror = (event) => {
      if (event.error !== "no-speech" && event.error !== "aborted") error.value = event.error === "not-allowed" ? "microphone access was blocked." : `speech recognition error: ${event.error}`;
    };
    // Browsers end recognition on long silences; keep it going until stopped.
    recognition.onend = () => !stopped && recognition.start();
    recognition.start();
    return () => {
      stopped = true;
      recognition.stop();
    };
  }

  async function start(onSegment) {
    if (listening.value) return;
    error.value = "";
    interim.value = "";
    const apiKey = getApiKey();
    try {
      if (apiKey && canRecord) {
        engine.value = "openai";
        stopCurrent = await startOpenAi(apiKey, onSegment);
      } else if (browserRecognition) {
        engine.value = "browser";
        stopCurrent = startBrowser(onSegment);
      } else {
        throw new Error("this browser has no speech recognition. add an openai key in settings to dictate.");
      }
      listening.value = true;
    } catch (cause) {
      engine.value = null;
      error.value = cause.name === "NotAllowedError" ? "microphone access was blocked." : cause.message;
    }
  }
  function stop() {
    stopCurrent?.();
    stopCurrent = null;
    listening.value = false;
    interim.value = "";
  }
  const toggle = (onSegment) => (listening.value ? stop() : start(onSegment));

  // Read text aloud (on-the-go playback of a consensus).
  const speaking = ref(false);
  function speak(text) {
    speaking.value = speakText(text, { onEnd: () => (speaking.value = false) });
  }
  function stopSpeaking() {
    stopSpeech();
    speaking.value = false;
  }

  onBeforeUnmount(() => {
    stop();
    stopSpeaking();
  });
  return { listening, engine, interim, error, pending, start, stop, toggle, speak, stopSpeaking, speaking, supported: Boolean(canRecord || browserRecognition) };
}
