// The illustrative agent network, shared by the graph and the OpenAI analysis.
// Only these fixed stakeholders are ever scored (the response schema enumerates
// their ids), so scenario text can never inject new labels.
export const AGENTS = [
  { label: "your scenario", category: "core", x: 228, y: 188 },
  { label: "residents", category: "community", x: 124, y: 117 },
  { label: "clinic staff", category: "provider", x: 337, y: 118 },
  { label: "local press", category: "media", x: 352, y: 245 },
  { label: "caregivers", category: "community", x: 164, y: 291 },
  { label: "commuters", category: "community", x: 76, y: 220 },
  { label: "city council", category: "policy", x: 233, y: 62 },
  { label: "insurers", category: "economy", x: 410, y: 177 },
  { label: "pharmacies", category: "provider", x: 296, y: 330 },
  { label: "students", category: "community", x: 66, y: 70 },
  { label: "seniors", category: "community", x: 85, y: 328 },
  { label: "employers", category: "economy", x: 403, y: 70 },
];

export const RELATIONS = [
  [0, 1, "affects"], [0, 2, "staffs"], [0, 3, "covered by"], [0, 4, "affects"],
  [0, 5, "affects"], [0, 6, "approved by"], [1, 5, "overlaps"], [1, 6, "lobbies"],
  [1, 9, "includes"], [2, 6, "reports to"], [2, 7, "bills"], [2, 11, "partners"],
  [3, 7, "scrutinizes"], [3, 8, "reports on"], [4, 5, "carpools"], [4, 8, "relies on"],
  [4, 10, "cares for"], [5, 10, "shares transit"],
];

export const CATEGORIES = ["core", "community", "provider", "policy", "media", "economy"];

export const agentId = (index) => String(index + 1).padStart(2, "0");

// Stance scale for the model's structured output (indices 0–4).
export const STANCE_LEVELS = [
  "strongly opposed",
  "opposed",
  "neutral or mixed",
  "supportive",
  "strongly supportive",
];
