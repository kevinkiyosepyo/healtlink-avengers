// Study build: protocol text → schedule of activities, draft CRF, edit checks
// and burden; then source-note extraction → auto-generated data queries.
// Deterministic and local. Assessment definitions come from a small built-in
// library; the protocol can override ranges with "Range: field min-max" lines.

export const ASSESSMENTS = {
  consent: { label: "informed consent", participantMin: 30, siteMin: 30, fields: [
    { name: "consent_date", label: "consent date", type: "date", required: true },
    { name: "consent_version", label: "consent version", type: "text", required: true },
  ] },
  eligibility: { label: "eligibility", participantMin: 15, siteMin: 20, fields: [
    { name: "inclusion_met", label: "all inclusion criteria met", type: "yesno", required: true },
    { name: "exclusion_present", label: "any exclusion criterion present", type: "yesno", required: true },
  ] },
  demographics: { label: "demographics", participantMin: 10, siteMin: 10, fields: [
    { name: "age", label: "age", type: "number", unit: "years", min: 18, max: 75, required: true },
    { name: "sex", label: "sex at birth", type: "text", required: true },
  ] },
  vitals: { label: "vital signs", participantMin: 10, siteMin: 10, fields: [
    { name: "systolic_bp", label: "systolic blood pressure", type: "number", unit: "mmHg", min: 90, max: 160, required: true },
    { name: "diastolic_bp", label: "diastolic blood pressure", type: "number", unit: "mmHg", min: 50, max: 100, required: true },
    { name: "heart_rate", label: "heart rate", type: "number", unit: "bpm", min: 40, max: 120, required: true },
    { name: "weight", label: "weight", type: "number", unit: "kg", min: 40, max: 200, required: false },
  ] },
  labs: { label: "safety labs", participantMin: 20, siteMin: 25, fields: [
    { name: "alt", label: "ALT", type: "number", unit: "U/L", min: 0, max: 120, required: true },
    { name: "creatinine", label: "creatinine", type: "number", unit: "mg/dL", min: 0.4, max: 1.5, required: true },
  ] },
  "sleep diary": { label: "sleep diary", participantMin: 15, siteMin: 5, fields: [
    { name: "total_sleep", label: "total sleep", type: "number", unit: "h", min: 0, max: 14, required: true },
    { name: "awakenings", label: "awakenings", type: "number", min: 0, max: 20, required: false },
  ] },
  questionnaire: { label: "questionnaires (ISI, PHQ-9)", participantMin: 20, siteMin: 10, fields: [
    { name: "isi_score", label: "ISI score", type: "number", min: 0, max: 28, required: true },
    { name: "phq9_score", label: "PHQ-9 score", type: "number", min: 0, max: 27, required: true },
  ] },
  "adverse events": { label: "adverse events", participantMin: 10, siteMin: 15, fields: [
    { name: "ae_reported", label: "AE reported", type: "yesno", required: true },
    { name: "ae_description", label: "AE description", type: "text", required: false },
  ] },
  "wearable setup": { label: "wearable setup", participantMin: 20, siteMin: 20, fields: [
    { name: "device_id", label: "device ID", type: "text", required: true },
  ] },
  "wearable return": { label: "wearable return", participantMin: 10, siteMin: 15, fields: [
    { name: "device_returned", label: "device returned", type: "yesno", required: true },
    { name: "wear_days", label: "days worn", type: "number", min: 0, max: 60, required: false },
  ] },
};

const VISIT_LINE = /^\s*(?:[-*]\s*)?visit\s+(\d+)\s*(?:[—–-]\s*([^()]+?))?\s*\(\s*day\s*(-?\d+)\s*(?:±\s*(\d+))?\s*\)\s*:\s*(.+)$/i;
const RANGE_LINE = /^\s*(?:[-*]\s*)?range\s*:\s*([a-z0-9_]+)\s+(-?\d+(?:\.\d+)?)\s*[-–]\s*(-?\d+(?:\.\d+)?)/i;

const clone = (value) => JSON.parse(JSON.stringify(value));
const key = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Parse the protocol into a study build. Never throws; problems become warnings. */
export function buildStudy(protocolText) {
  const lines = String(protocolText ?? "").split(/\r\n|\n|\r/);
  const library = clone(ASSESSMENTS);
  const visits = [];
  const warnings = [];
  const overrides = [];

  lines.forEach((line, index) => {
    const range = line.match(RANGE_LINE);
    if (range) {
      const [, field, min, max] = range;
      const target = Object.values(library).flatMap((a) => a.fields).find((f) => f.name === field.toLowerCase());
      if (target) {
        target.min = Number(min);
        target.max = Number(max);
        overrides.push({ field: target.name, min: target.min, max: target.max, line: index + 1 });
      } else warnings.push({ line: index + 1, message: `range for unknown field "${field}" ignored` });
      return;
    }
    const visit = line.match(VISIT_LINE);
    if (!visit) return;
    const [, number, name, day, window, list] = visit;
    const assessments = list.split(/,|;/).map((item) => key(item)).filter(Boolean);
    const unknown = assessments.filter((a) => !library[a]);
    for (const a of unknown) warnings.push({ line: index + 1, message: `"${a}" isn't in the assessment library — captured as a free-text form` });
    if (window === undefined && Number(day) !== 0) warnings.push({ line: index + 1, message: `visit ${number} has no visit window (± days)` });
    visits.push({
      id: `v${number}`,
      number: Number(number),
      name: (name || `visit ${number}`).trim().toLowerCase(),
      day: Number(day),
      window: window === undefined ? 0 : Number(window),
      assessments,
      line: index + 1,
    });
  });

  visits.sort((a, b) => a.day - b.day);
  for (let i = 1; i < visits.length; i++) {
    if (visits[i].day - visits[i].window <= visits[i - 1].day + visits[i - 1].window && visits[i].day !== visits[i - 1].day) {
      warnings.push({ line: visits[i].line, message: `visit ${visits[i].number}'s window overlaps visit ${visits[i - 1].number}` });
    }
  }
  if (!visits.length) warnings.push({ line: 0, message: 'no "Visit N — name (Day D ± W): assessments" lines found' });

  const used = [...new Set(visits.flatMap((v) => v.assessments))];
  const forms = used.map((id) => {
    const def = library[id] ?? { label: id, participantMin: 10, siteMin: 10, fields: [{ name: `${id.replace(/\s+/g, "_")}_notes`, label: `${id} notes`, type: "text", required: false }] };
    return { id, label: def.label, participantMin: def.participantMin, siteMin: def.siteMin, fields: def.fields, known: Boolean(library[id]) };
  });
  const formById = Object.fromEntries(forms.map((f) => [f.id, f]));

  const editChecks = [];
  for (const form of forms) {
    for (const field of form.fields) {
      if (field.required) editChecks.push({ type: "required", form: form.id, field: field.name, rule: `${field.label} must be entered` });
      if (field.min !== undefined) editChecks.push({ type: "range", form: form.id, field: field.name, rule: `${field.label} between ${field.min} and ${field.max}${field.unit ? ` ${field.unit}` : ""}` });
    }
  }
  for (const visit of visits) {
    if (visit.window) editChecks.push({ type: "window", visit: visit.id, rule: `${visit.name} on day ${visit.day} ± ${visit.window}` });
  }

  const burden = visits.map((visit) => ({
    visit: visit.id,
    participantMin: visit.assessments.reduce((sum, a) => sum + (formById[a]?.participantMin ?? 0), 0),
    siteMin: visit.assessments.reduce((sum, a) => sum + (formById[a]?.siteMin ?? 0), 0),
    fields: visit.assessments.reduce((sum, a) => sum + (formById[a]?.fields.length ?? 0), 0),
  }));
  const totals = burden.reduce((acc, b) => ({ participantMin: acc.participantMin + b.participantMin, siteMin: acc.siteMin + b.siteMin, fields: acc.fields + b.fields }), { participantMin: 0, siteMin: 0, fields: 0 });

  return { visits, forms, editChecks, burden, totals, warnings, overrides };
}

function fieldIndex(build, visitId) {
  const visit = build.visits.find((v) => v.id === visitId);
  if (!visit) return { visit: null, fields: [] };
  const fields = visit.assessments.flatMap((a) => (build.forms.find((f) => f.id === a)?.fields ?? []).map((field) => ({ ...field, form: a })));
  return { visit, fields };
}

const YES = /^(y|yes|true|present|reported)$/i;
const NO = /^(n|no|none|false|absent|not reported)$/i;

/**
 * Extract values for one visit from a free-text source note. Recognizes
 * "Label: value" lines (matched against field names and labels), "BP 120/80",
 * "HR 72" and a "Visit date: YYYY-MM-DD" line. Every value keeps its source line.
 */
export function extractSource(build, visitId, noteText) {
  const { visit, fields } = fieldIndex(build, visitId);
  const lines = String(noteText ?? "").split(/\r\n|\n|\r/);
  const values = {};
  let visitDate = null;
  const record = (name, raw, index) => {
    if (!(name in values)) values[name] = { raw: String(raw).trim(), line: index + 1, quote: lines[index].trim() };
  };
  lines.forEach((line, index) => {
    const bp = line.match(/\b(?:bp|blood pressure)\s*:?\s*(\d{2,3})\s*\/\s*(\d{2,3})/i);
    if (bp) {
      record("systolic_bp", bp[1], index);
      record("diastolic_bp", bp[2], index);
    }
    const hr = line.match(/\b(?:hr|heart rate|pulse)\s*:?\s*(\d{2,3})\b/i);
    if (hr) record("heart_rate", hr[1], index);
    const date = line.match(/^\s*visit date\s*:\s*(\d{4}-\d{2}-\d{2})/i);
    if (date) visitDate = { value: date[1], line: index + 1, quote: line.trim() };
    const pair = line.match(/^\s*(?:[-*]\s*)?([^:]{2,40}):\s*(.+)$/);
    if (!pair) return;
    const label = key(pair[1]);
    const field = fields.find((f) => key(f.name) === label || key(f.label) === label || key(f.label).startsWith(label) || label.startsWith(key(f.label)));
    if (field) record(field.name, pair[2].replace(/\s*(mmhg|bpm|h|hrs?|hours|kg|u\/l|mg\/dl)\.?$/i, ""), index);
  });
  return { visit, fields, values, visitDate };
}

function addDays(isoDate, days) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
function dayDiff(fromIso, toIso) {
  return Math.round((new Date(`${toIso}T00:00:00Z`) - new Date(`${fromIso}T00:00:00Z`)) / 86_400_000);
}

/** Run the edit checks against extracted values and emit queries like a monitor would. */
export function generateQueries(extraction, { day0Date } = {}) {
  const { visit, fields, values, visitDate } = extraction;
  const queries = [];
  if (!visit) return queries;
  for (const field of fields) {
    const entry = values[field.name];
    if (!entry) {
      if (field.required) queries.push({ severity: "medium", type: "missing", field: field.name, message: `${field.label} is required at ${visit.name} but wasn't found in the source note.` });
      continue;
    }
    if (field.type === "number") {
      const value = Number(entry.raw.replace(/[^\d.-]/g, ""));
      if (!Number.isFinite(value)) queries.push({ severity: "medium", type: "invalid", field: field.name, message: `${field.label} "${entry.raw}" isn't a number.`, source: entry });
      else if (field.min !== undefined && (value < field.min || value > field.max)) {
        queries.push({ severity: "high", type: "range", field: field.name, message: `${field.label} ${value}${field.unit ? ` ${field.unit}` : ""} is outside the protocol range ${field.min}–${field.max}. please confirm against source or report.`, source: entry });
      }
    } else if (field.type === "yesno" && !YES.test(entry.raw) && !NO.test(entry.raw)) {
      queries.push({ severity: "low", type: "invalid", field: field.name, message: `${field.label} should be yes or no (found "${entry.raw}").`, source: entry });
    } else if (field.type === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(entry.raw)) {
      queries.push({ severity: "low", type: "invalid", field: field.name, message: `${field.label} should be a YYYY-MM-DD date.`, source: entry });
    }
  }
  if (day0Date && visitDate) {
    const actual = dayDiff(day0Date, visitDate.value);
    if (Math.abs(actual - visit.day) > visit.window) {
      queries.push({
        severity: "high",
        type: "window",
        field: "visit_date",
        message: `${visit.name} happened on day ${actual}; the protocol window is day ${visit.day} ± ${visit.window} (${addDays(day0Date, visit.day - visit.window)} to ${addDays(day0Date, visit.day + visit.window)}). document a protocol deviation if confirmed.`,
        source: visitDate,
      });
    }
  } else if (visit.window && !visitDate) {
    queries.push({ severity: "low", type: "missing", field: "visit_date", message: `add a "Visit date:" line so the visit window can be checked.` });
  }
  const order = { high: 0, medium: 1, low: 2 };
  return queries.sort((a, b) => order[a.severity] - order[b.severity]);
}

export const SAMPLE_PROTOCOL = `# REST-101 protocol v2 — schedule of activities (fictional)
Study ID: REST-101
Version: 2.0

Visit 1 — Screening (Day -14 ± 3): consent, eligibility, demographics, vitals, labs
Visit 2 — Baseline (Day 0): vitals, sleep diary, questionnaire, wearable setup
Visit 3 — Week 2 (Day 14 ± 2): vitals, sleep diary, adverse events
Visit 4 — Week 4 (Day 28 ± 3): vitals, labs, questionnaire, adverse events
Visit 5 — End of study (Day 56 ± 3): vitals, labs, questionnaire, adverse events, wearable return

Range: systolic_bp 90-150
`;

export const SAMPLE_SOURCE = `Site note — participant R101-014 (fictional)
Visit: 3
Visit date: 2026-10-23
BP 162/88
HR 71
Total sleep: 6.5 h
Awakenings: 3
AE reported: no`;

export const SAMPLE_DAY0 = "2026-10-05";
