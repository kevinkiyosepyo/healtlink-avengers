// Guardrails for scenario prompts. Shared by the browser (instant feedback)
// and the stance API (authoritative check). Pure functions, unit-tested.
//
// Scope: questions about healthcare, medicine, public health and health
// services for a community. Anything else is declined with a reason code; the
// UI maps codes to friendly copy. In OpenAI mode these rules run first, then
// OpenAI moderation (input and output), then the model's own scope check.

export const MAX_PROMPT_LENGTH = 600;

export const BLOCK_REASONS = {
  empty: "ask a question about a healthcare scenario to run a simulation.",
  too_long: `keep scenarios under ${MAX_PROMPT_LENGTH} characters.`,
  personal_info:
    "remove personal details (names with health info, contact details, ids or record numbers) — scenarios should describe groups, not individuals.",
  secrets: "this looks like it contains credentials or asks for system details, which microfish can't help with.",
  injection: "microfish only answers scenario questions; it can't change its instructions.",
  individual_care:
    "microfish simulates community-level scenarios and can't give personal diagnosis, dosing or treatment advice. please talk to a clinician.",
  crisis:
    "it sounds like you or someone else may be in danger. in the US, call or text 988 (suicide & crisis lifeline) or call 911 for emergencies.",
  off_topic: "microfish only simulates healthcare and public-health scenarios. try rephrasing around a health service, clinic, or community health question.",
  unsafe: "this request falls outside what microfish can simulate safely.",
  controversial:
    "microfish avoids partisan, religious or culture-war framings. try asking about the practical health impact instead.",
  confidential: "microfish can't help with confidential or identifying information.",
  flagged: "this scenario was flagged by content moderation and wasn't sent for analysis.",
};

const PATTERNS = {
  personal_info: [
    /\b\d{3}-\d{2}-\d{4}\b/, // US SSN
    /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/, // email
    /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/, // phone
    /\b(?:mrn|medical record|patient id|member id|policy number|dob|date of birth)\b[\s:#-]*\w*/i,
    /\b\d{1,2}\/\d{1,2}\/(?:19|20)\d{2}\b/, // full dates (often DOB)
  ],
  secrets: [
    /\b(?:api[_\s-]?key|secret|password|passwd|bearer|access[_\s-]?token|private[_\s-]?key)\b/i,
    /\b(?:sk|pk|gho|ghp|xox[abp])[-_][A-Za-z0-9]{8,}/,
    /\b(?:env|environment) variables?\b/i,
  ],
  injection: [
    /\b(?:ignore|disregard|forget|override)\b.{0,40}\b(?:instructions|rules|prompt|guardrails|above|previous)\b/i,
    /\b(?:system|developer|hidden) (?:prompt|message|instructions)\b/i,
    /\b(?:jailbreak|dan mode|pretend you are|act as (?:an? )?(?:unfiltered|unrestricted))\b/i,
  ],
  crisis: [
    /\b(?:kill|hurt|harm) (?:myself|himself|herself|themselves)\b/i,
    /\b(?:suicide|suicidal|end my life|self[-\s]?harm|overdose on purpose)\b/i,
  ],
  individual_care: [
    /\b(?:should i|can i|how (?:much|many) .{0,20}should i) (?:take|stop taking|double|mix)\b/i,
    /\b(?:my|his|her) (?:dose|dosage|prescription|diagnosis|symptoms?)\b/i,
    /\bdo i have\b/i,
  ],
  controversial: [
    /\b(?:vote for|who should (?:i|we) vote|democrats?|republicans?|left[-\s]wing|right[-\s]wing|maga|woke|liberals?|conservatives?)\b/i,
    /\b(?:which|what) (?:religion|race|ethnicity) is (?:better|worse|superior)\b/i,
  ],
  unsafe: [
    /\b(?:cut(?:s|ting)? off|amputat(?:e|es|ing)|mutilat(?:e|es|ing)|tortur(?:e|es|ing)|maim(?:s|ing)?|stab(?:s|bing)?|shoot(?:s|ing)?|kill(?:s|ing)?|beat(?:s|ing)? up)\b.{0,40}\b(?:my|his|her|their|your|someone|people|patients?|kids?|children|limbs?|arms?|legs?|body|staff)\b/i,
    /\b(?:synthesi[sz]e|make|cook|weaponi[sz]e)\b.{0,30}\b(?:meth|fentanyl|toxin|poison|nerve agent|bioweapon|pathogen)\b/i,
    /\b(?:without (?:a )?prescription|fake (?:prescription|doctor'?s note)|forge)\b/i,
  ],
};

// Order matters: the most serious categories are reported first.
const ORDER = ["crisis", "secrets", "injection", "personal_info", "unsafe", "individual_care", "controversial"];

export function normalizePrompt(raw) {
  if (typeof raw !== "string") return "";
  // Strip control characters and collapse whitespace.
  return raw.replace(/[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/g, " ").replace(/\s+/g, " ").trim();
}

/** Fast deterministic screen. Returns { allowed, reason, prompt }. */
export function screenPrompt(raw) {
  const prompt = normalizePrompt(raw);
  if (!prompt) return { allowed: false, reason: "empty", prompt };
  if (prompt.length > MAX_PROMPT_LENGTH) return { allowed: false, reason: "too_long", prompt };
  for (const reason of ORDER) {
    if (PATTERNS[reason].some((pattern) => pattern.test(prompt))) return { allowed: false, reason, prompt };
  }
  return { allowed: true, reason: null, prompt };
}

// Keyword topic check for demo mode (no model available), so the
// "healthcare scenarios only" rule still holds without one.
const HEALTH_TERMS =
  /\b(?:health|healthcare|clinic|clinics|hospital|patients?|medical|medicine|medication|pharmac(?:y|ies|ist)|doctors?|nurses?|physicians?|care(?:givers?)?|appointments?|vaccin\w*|immuni[sz]\w*|disease|illness|treatment|therap\w*|mental|wellness|insur\w*|medicaid|medicare|telehealth|screening|prevention|chronic|diabetes|asthma|maternal|prenatal|public health|outbreak|epidemic|pandemic|emergency room|er visits?|urgent care|dental|vision|nutrition|elderly|seniors?|flu|shots?|paramedics?|ambulances?|ems|prescri\w*|painkillers?|symptoms?|surger(?:y|ies)|clinicians?|covid\w*|hiv|opioids?|addiction|substance use|overdoses?|blood|poisoning|wait times?)\b/i;

export function isHealthTopic(raw) {
  return HEALTH_TERMS.test(normalizePrompt(raw));
}
