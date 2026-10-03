// Research records: one complete, self-describing entry per run so a
// researcher can cite, audit or re-run any result later. Pure helpers; storage
// lives in useResearch.
import { AGENTS, STANCE_LEVELS, agentId } from "./agents.js";

export const RECORD_SCHEMA_VERSION = 1;

// Stable JSON (sorted keys) so the same content always hashes the same.
export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

export async function sha256(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Cache key for identical analyses (same prompt, model and parameters). */
export function analysisKey({ prompt, model, temperature, seed, promptVersion }) {
  return sha256(canonicalJson({ prompt: prompt.trim().toLowerCase(), model, temperature, seed, promptVersion }));
}

/**
 * Build a record. The fingerprint covers everything except itself, so any
 * later edit to an exported file is detectable with verifyRecord().
 */
export async function createRecord({ runId, sessionId, sessionTitle, prompt, mode, guardrails, analysis = null, provenance = null, error = null, analysisKey = null, createdAt = new Date().toISOString() }) {
  const body = {
    schemaVersion: RECORD_SCHEMA_VERSION,
    runId,
    sessionId,
    sessionTitle,
    createdAt,
    mode, // "demo" | "openai"
    prompt,
    guardrails, // { local: "pass", moderation: "pass" | "skipped" | [...categories], scope: "pass" | reason }
    provenance,
    analysis,
    error,
    analysisKey, // hash of prompt + model + parameters; identical analyses share it
    disclaimer: "Illustrative simulation output. Not medical advice; verify before use.",
  };
  return { ...body, fingerprint: await sha256(canonicalJson(body)) };
}

export async function verifyRecord(record) {
  const { fingerprint, ...body } = record;
  return fingerprint === (await sha256(canonicalJson(body)));
}

function csvCell(value) {
  const text = value === null || value === undefined ? "" : String(value);
  // Quote everything that needs it, and neutralize spreadsheet formula injection.
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export const CSV_COLUMNS = [
  "created_at", "session_title", "run_id", "mode", "model", "temperature", "seed", "prompt_version",
  "latency_ms", "prompt", "agent_id", "agent", "category", "stance_score", "stance_label", "confidence", "rationale", "fingerprint",
];

/** One row per agent per record (long format, easy to pivot in R/pandas/Excel). */
export function recordsToCsv(records) {
  const rows = [CSV_COLUMNS.join(",")];
  for (const record of records) {
    const p = record.provenance ?? {};
    const shared = [record.createdAt, record.sessionTitle, record.runId, record.mode, p.model, p.temperature, p.seed, p.promptVersion, p.latencyMs, record.prompt];
    const stances = record.analysis?.stances ?? {};
    AGENTS.forEach((agent, index) => {
      if (index === 0) return;
      const stance = stances[agentId(index)];
      rows.push(
        [...shared, agentId(index), agent.label, agent.category, stance?.score, stance ? STANCE_LEVELS[Math.round(stance.score)] : "", stance?.confidence, stance?.rationale, record.fingerprint]
          .map(csvCell)
          .join(","),
      );
    });
  }
  return rows.join("\n");
}
