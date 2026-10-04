// Voice dictation helpers (pure, testable). Turns raw speech-to-text into
// clean composer text the way dictation tools do: drops fillers, converts
// spoken punctuation, honors "scratch that", and detects a trailing
// "run it" / "send it" command for hands-free use.
import { LlmError, OPENAI_BASE } from "./llm.js";

const FILLERS = /\b(?:u+m+|u+h+|e+r+m+|uhm|hmm+|you know|i mean)\b[,.]?\s*/gi;
const SPOKEN = [
  [/\s*\b(?:new paragraph)\b\s*/gi, "\n\n"],
  [/\s*\b(?:new line|next line)\b\s*/gi, "\n"],
  [/\s*\b(?:comma)\b/gi, ","],
  [/\s*\b(?:full stop|period)\b/gi, "."],
  [/\s*\b(?:question mark)\b/gi, "?"],
  [/\s*\b(?:exclamation (?:mark|point))\b/gi, "!"],
  [/\s*\b(?:colon)\b/gi, ":"],
];
const COMMAND = /[\s,.]*\b(?:run it|send it|go ahead and run it|submit it)\b[\s.!]*$/i;

/** "scratch that" deletes back to the previous sentence, comma or line break. */
function applyScratch(text) {
  const marker = /\bscratch that\b[.,!]?/i;
  let out = text;
  for (let match = marker.exec(out); match; match = marker.exec(out)) {
    const before = out.slice(0, match.index).replace(/[\s,;]+$/, "");
    const cut = Math.max(...[".", "!", "?", ",", "\n"].map((mark) => before.lastIndexOf(mark)));
    out = `${cut >= 0 ? before.slice(0, cut + 1) : ""} ${out.slice(match.index + match[0].length).trimStart()}`;
  }
  return out;
}

/** Clean one dictated segment. Returns { text, command: "send" | null }. */
export function cleanTranscript(raw) {
  let text = String(raw ?? "");
  let command = null;
  if (COMMAND.test(text)) {
    command = "send";
    text = text.replace(COMMAND, "");
  }
  text = applyScratch(text).replace(FILLERS, "");
  for (const [pattern, replacement] of SPOKEN) text = text.replace(pattern, replacement);
  text = text
    .replace(/[ \t]+/g, " ")
    .replace(/ +([,.?!:])/g, "$1")
    .replace(/([,.?!:])(?=[A-Za-z])/g, "$1 ")
    .replace(/ *\n */g, "\n")
    .trim();
  // Capitalize sentence starts.
  text = text.replace(/(^|[.!?]\s+|\n)([a-z])/g, (m, lead, ch) => lead + ch.toUpperCase());
  return { text, command };
}

/** Join a new segment onto existing draft text with sensible spacing. */
export function appendSegment(draft, segment) {
  if (!segment) return draft;
  if (!draft.trim()) return segment;
  const joiner = /\n$/.test(draft) || /^\n/.test(segment) ? "" : " ";
  return `${draft.replace(/[ \t]+$/, "")}${joiner}${segment}`;
}

// Domain vocabulary helps the transcription model with trial terms.
export const TRANSCRIBE_PROMPT = "Clinical-trial operations dictation: protocol, informed consent, e-consent, IRB, ethics board, DSMB, CRO, sponsor, site activation, enrollment, retention, adverse events, EDC, CRF, randomization, REST-101.";

/** Transcribe one audio segment with the researcher's OpenAI key. */
export async function transcribeSegment(blob, { apiKey, fetchImpl = fetch, model = "gpt-4o-mini-transcribe" }) {
  async function send(modelName) {
    const form = new FormData();
    form.append("file", blob, `segment.${blob.type.includes("mp4") ? "mp4" : "webm"}`);
    form.append("model", modelName);
    form.append("prompt", TRANSCRIBE_PROMPT);
    const response = await fetchImpl(`${OPENAI_BASE}/audio/transcriptions`, { method: "POST", headers: { Authorization: `Bearer ${apiKey}` }, body: form });
    if (response.status === 401) throw new LlmError("auth");
    if (!response.ok) throw new LlmError(response.status === 400 || response.status === 404 ? "bad_request" : "unavailable");
    return (await response.json()).text ?? "";
  }
  try {
    return await send(model);
  } catch (error) {
    if (error.code === "bad_request" && model !== "whisper-1") return send("whisper-1");
    throw error;
  }
}


/** Read text aloud with the browser's speech synthesis (on-the-go playback). */
export function speak(text, { onEnd = () => {} } = {}) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return false;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1.03;
  utterance.onend = utterance.onerror = onEnd;
  window.speechSynthesis.speak(utterance);
  return true;
}
export function stopSpeaking() {
  if (typeof window !== "undefined") window.speechSynthesis?.cancel();
}

/** A consensus as a short spoken summary (no citation ids). */
export function consensusScript(deliberation) {
  const c = deliberation.consensus;
  const recommendation = { proceed: "Proceed.", proceed_with_changes: "Proceed with changes.", do_not_proceed: "Do not proceed.", insufficient_evidence: "The evidence is insufficient." }[c.recommendation] ?? "";
  const estimate = c.estimate ? `Estimated ${deliberation.metric?.name ?? "effect"}: ${c.estimate.value} ${deliberation.metric?.unit ?? ""}, ranging from ${c.estimate.low} to ${c.estimate.high}.` : "";
  const points = (c.key_points ?? []).map((p) => p.text).join(" ");
  return [recommendation, c.decision, estimate, points].filter(Boolean).join(" ");
}
