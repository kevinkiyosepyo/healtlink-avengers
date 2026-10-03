// Clinical-trial stakeholder network (Track 2), shared by the graph and the
// OpenAI analysis.
// Only these fixed stakeholders are ever scored (the response schema enumerates
// their ids), so scenario text can never inject new labels.
export const AGENTS = [
  { label: "protocol change", category: "core", x: 228, y: 188 },
  { label: "participants", category: "participant", x: 124, y: 117 },
  { label: "caregivers", category: "participant", x: 164, y: 291 },
  { label: "patient advocates", category: "participant", x: 66, y: 70 },
  { label: "site coordinators", category: "site", x: 337, y: 118 },
  { label: "principal investigator", category: "site", x: 233, y: 62 },
  { label: "research nurses", category: "site", x: 296, y: 330 },
  { label: "ethics board", category: "oversight", x: 410, y: 177 },
  { label: "safety monitoring board", category: "oversight", x: 403, y: 70 },
  { label: "sponsor", category: "sponsor", x: 352, y: 245 },
  { label: "CRO monitors", category: "sponsor", x: 85, y: 328 },
  { label: "data managers", category: "data", x: 76, y: 220 },
];

export const RELATIONS = [
  [0, 1, "asks more of"], [0, 4, "changes workflow for"], [0, 7, "needs amendment from"], [0, 9, "funded by"],
  [0, 11, "changes CRFs for"], [0, 5, "led by"], [1, 2, "supported by"], [1, 3, "represented by"],
  [1, 4, "scheduled by"], [1, 6, "seen by"], [4, 5, "reports to"], [4, 10, "monitored by"],
  [4, 11, "enters data for"], [5, 7, "submits to"], [5, 8, "reports safety to"], [9, 10, "contracts"],
  [9, 8, "charters"], [11, 10, "verified by"],
];

export const CATEGORIES = ["core", "participant", "site", "oversight", "sponsor", "data"];

export const agentId = (index) => String(index + 1).padStart(2, "0");

// Stance scale for the model's structured output (indices 0–4) and its
// diverging color: opposed (dusty rose) → neutral (warm grey) → supportive (sage).
export function stanceColor(score) {
  if (score < 2) return `color-mix(in oklab, var(--stance-opposed) ${Math.round(((2 - score) / 2) * 100)}%, var(--stance-neutral))`;
  return `color-mix(in oklab, var(--stance-supportive) ${Math.round(((score - 2) / 2) * 100)}%, var(--stance-neutral))`;
}

export const STANCE_LEVELS = [
  "strongly opposed",
  "opposed",
  "neutral or mixed",
  "supportive",
  "strongly supportive",
];
