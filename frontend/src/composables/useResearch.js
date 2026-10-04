import { computed, markRaw, reactive, ref, watch } from "vue";
import { isHealthTopic, screenPrompt } from "../lib/guardrails.js";
import { LlmError, PROMPT_VERSION, analyzeScenario, listModels, moderate } from "../lib/llm.js";
import { analysisKey, createRecord, recordsToCsv } from "../lib/records.js";
import { downloadText, stamp } from "../lib/download.js";
import { readJson, writeJson } from "../lib/storage.js";
import { STORAGE_KEY as WORKSPACE_KEY } from "../lib/simulationWorkspace.js";
import { recordStorage } from "../lib/recordStorage.js";
import { gatherEvidence, runDeliberation } from "../lib/evidence/deliberation.js";
import { useLibrary } from "./useLibrary.js";

const SETTINGS_KEY = "microfish:settings";
const KEY_SESSION_KEY = "microfish:openai-key"; // sessionStorage only: cleared when the tab closes

function safely(fn) {
  try {
    return fn();
  } catch {
    return undefined;
  }
}

export const ERROR_COPY = {
  auth: "openai rejected the key. check it in settings.",
  rate_limited: "openai is rate-limiting this key. wait a moment and retry.",
  unavailable: "openai is unreachable right now. the demo run continues; retry the analysis later.",
  timeout: "the analysis timed out. retry, or pick a faster model.",
  invalid_response: "the model returned an incomplete answer, so it was discarded. retry the analysis.",
  refused: "the model declined this scenario.",
  bad_request: "openai couldn't process this request with the selected model.",
};

let instance;

// Research mode, BYO key, durable records and exports.
export function useResearch(sessions) {
  if (instance) return instance;

  const saved = readJson(SETTINGS_KEY, {});
  const settings = reactive({
    mode: saved.mode === "openai" ? "openai" : "demo",
    model: saved.model || "",
    temperature: typeof saved.temperature === "number" ? saved.temperature : 0,
    seed: Number.isInteger(saved.seed) ? saved.seed : 7,
    rememberKey: Boolean(saved.rememberKey),
    // Evidence deliberation after each analysis; web search is the secondary source.
    evidence: saved.evidence !== false,
    web: saved.web !== false,
  });
  const apiKey = ref(settings.rememberKey ? safely(() => window.sessionStorage.getItem(KEY_SESSION_KEY)) || "" : "");
  const keyStatus = ref(apiKey.value ? "unchecked" : "none"); // none | unchecked | checking | valid | invalid
  const keyError = ref("");
  const models = ref([]);
  const persistent = ref(null);

  watch(
    settings,
    () => writeJson(SETTINGS_KEY, settings),
    { deep: true },
  );
  watch([apiKey, () => settings.rememberKey], ([key, remember]) => {
    safely(() => (remember && key ? window.sessionStorage.setItem(KEY_SESSION_KEY, key) : window.sessionStorage.removeItem(KEY_SESSION_KEY)));
  });

  // ---------- storage ----------
  const records = reactive({}); // runId -> record
  // Analysis cache derived from records (no separate store): deleting a chat
  // deletes its records, and with them any cached model output.
  const byAnalysisKey = new Map(); // analysisKey -> runId
  const status = reactive({}); // runId -> analyzing | ready | blocked | error

  const storageLoaded = (async () => {
    try {
      for (const [runId, record] of await recordStorage.load()) {
        if (!isRecordLive(record)) continue;
        records[runId] = markRaw(record);
        indexRecord(record);
        status[runId] = record.error ? "error" : record.analysis?.inScope === false ? "blocked" : "ready";
      }
    } catch { /* Keep the workspace usable when browser storage is unavailable. */ }
  })();
  // A persistence permission prompt must not hold up loading or new analyses.
  void storageLoaded.then(async () => {
    try { persistent.value = (await navigator.storage?.persist?.()) ?? false; }
    catch { persistent.value = false; }
  });

  function isRecordLive(record) {
    return Boolean(record && sessions.value.some(session => session.id === record.sessionId) && recordStorage.isLive(record.sessionId));
  }
  function indexRecord(record) {
    if (record.analysisKey && record.analysis && !record.error) byAnalysisKey.set(record.analysisKey, record.runId);
  }
  function unindexRecord(runId) {
    const key = records[runId]?.analysisKey;
    if (key && byAnalysisKey.get(key) === runId) byAnalysisKey.delete(key);
  }
  function forgetRecord(runId) {
    unindexRecord(runId);
    delete records[runId];
    delete status[runId];
  }
  async function saveRecord(record) {
    // Loading must finish first so an older IndexedDB snapshot cannot replace
    // a newly completed analysis. A deleted chat must never be resurrected.
    await storageLoaded;
    if (!isRecordLive(record)) {
      forgetRecord(record.runId);
      await recordStorage.deleteRun(record.runId).catch(() => {});
      return null;
    }
    const saved = await recordStorage.save(record).catch(() => true);
    if (!saved || !isRecordLive(record)) {
      forgetRecord(record.runId);
      await recordStorage.deleteRun(record.runId).catch(() => {});
      return null;
    }
    // Replacing a record (e.g. adding its deliberation) keeps the run's status.
    unindexRecord(record.runId);
    // Records are immutable snapshots (replaced, never mutated), so skip deep
    // reactivity: large deliberations would otherwise get thousands of proxies.
    records[record.runId] = markRaw(record);
    indexRecord(record);
    return record;
  }

  function pruneRecords() {
    for (const [runId, record] of Object.entries(records)) {
      if (!isRecordLive(record)) forgetRecord(runId);
    }
  }
  // The shared deletion hook removes durable records. Keep caches and exports
  // synchronized as well, including when another entry point deletes a chat.
  watch(
    () => sessions.value.map((session) => session.id).join(","),
    pruneRecords,
    { flush: "sync" },
  );
  const workspaceChanged = event => {
    if (event.key !== WORKSPACE_KEY && event.key !== null) return;
    pruneRecords();
    void recordStorage.load().catch(() => {});
  };
  window.addEventListener("storage", workspaceChanged);
  if (import.meta.hot) import.meta.hot.dispose(() => window.removeEventListener("storage", workspaceChanged));

  // ---------- key ----------
  async function testKey() {
    if (!apiKey.value.trim()) {
      keyStatus.value = "none";
      return false;
    }
    keyStatus.value = "checking";
    keyError.value = "";
    try {
      models.value = await listModels(apiKey.value.trim());
      if (!models.value.length) throw new LlmError("bad_request", "no chat models available for this key");
      if (!models.value.includes(settings.model)) settings.model = models.value[0];
      keyStatus.value = "valid";
      return true;
    } catch (error) {
      keyStatus.value = "invalid";
      keyError.value = error.code === "auth" ? ERROR_COPY.auth : ERROR_COPY[error.code] ?? ERROR_COPY.unavailable;
      return false;
    }
  }
  function forgetKey() {
    apiKey.value = "";
    keyStatus.value = "none";
    models.value = [];
  }
  const ready = computed(() => settings.mode === "demo" || (keyStatus.value === "valid" && Boolean(settings.model)));
  const modeLabel = computed(() => (settings.mode === "openai" ? `openai · ${settings.model || "no model"}` : "demo · 12 agents"));

  // ---------- guarded flow ----------
  /** Pre-run checks. → { blocked } | { needsKey } | { guardrails } */
  async function check(prompt) {
    const local = screenPrompt(prompt);
    if (!local.allowed) return { blocked: local.reason };
    if (settings.mode === "demo") {
      if (!isHealthTopic(local.prompt)) return { blocked: "off_topic" };
      return { guardrails: { local: "pass", moderation: "skipped", scope: "keyword" } };
    }
    if (!ready.value) return { needsKey: true };
    try {
      const flagged = await moderate(apiKey.value.trim(), local.prompt);
      if (flagged.length) return { blocked: "flagged" };
      return { guardrails: { local: "pass", moderation: "pass" } };
    } catch (error) {
      if (error.code === "auth") keyStatus.value = "invalid";
      return { error: error.code };
    }
  }

  /** Record a run; in OpenAI mode also analyse it. Resolves to the record. */
  async function analyze({ run, session, guardrails, fresh = false }) {
    await storageLoaded;
    if (!isRecordLive({ sessionId: session.id })) return null;
    pruneRecords();
    const base = { runId: run.id, sessionId: session.id, sessionTitle: session.title, prompt: run.prompt, guardrails };
    if (settings.mode === "demo") {
      status[run.id] = "ready";
      return saveRecord(await createRecord({ ...base, mode: "demo", provenance: { provider: "local-demo", agents: 12, promptVersion: PROMPT_VERSION } }));
    }
    status[run.id] = "analyzing";
    const params = { prompt: run.prompt, model: settings.model, temperature: settings.temperature, seed: settings.seed, promptVersion: PROMPT_VERSION };
    try {
      const key = await analysisKey(params);
      const hit = fresh ? null : records[byAnalysisKey.get(key)];
      let result = hit ? { analysis: JSON.parse(JSON.stringify(hit.analysis)), provenance: hit.provenance } : null;
      const cached = Boolean(hit);
      // Speculative prefetch: gather evidence while the analysis (and its
      // scope check) runs. Discarded if the scenario turns out out of scope.
      const prefetch = !hit?.deliberation && settings.evidence ? startEvidence(run.id, run.prompt, session.id) : null;
      if (!result) {
        result = await analyzeScenario({ apiKey: apiKey.value.trim(), ...params });
        // Output moderation: never keep generated text that moderation flags.
        if (result.analysis.inScope) {
          const text = [...Object.values(result.analysis.stances).map((s) => s.rationale), ...result.analysis.assumptions, ...result.analysis.caveats].join("\n");
          if ((await moderate(apiKey.value.trim(), text)).length) {
            for (const stance of Object.values(result.analysis.stances)) stance.rationale = "";
            result.analysis.assumptions = [];
            result.analysis.caveats = [];
            result.analysis.redacted = true;
          }
        }
      }
      const inScope = result.analysis.inScope;
      status[run.id] = inScope ? "ready" : "blocked";
      if (!inScope && prefetch) {
        // Out of scope: drop the speculative evidence and its progress readout.
        delete progress[run.id];
        void prefetch.then(() => delete progress[run.id]);
      }
      return saveRecord(
        await createRecord({
          ...base,
          mode: "openai",
          guardrails: { ...guardrails, scope: inScope ? "pass" : result.analysis.reason },
          analysis: result.analysis,
          provenance: { ...result.provenance, cached, cachedFrom: hit ? hit.runId : null },
          analysisKey: key,
          deliberation: hit?.deliberation ?? null,
        }),
      ).then((record) => {
        // Not awaited: the analysis is usable now; the debate fills in later.
        if (record && inScope && settings.evidence && !record.deliberation) void deliberate(run.id, prefetch);
        return record;
      });
    } catch (error) {
      status[run.id] = "error";
      if (error.code === "auth") keyStatus.value = "invalid";
      return saveRecord(await createRecord({ ...base, mode: "openai", provenance: { provider: "openai", requestedModel: settings.model }, error: error.code ?? "unavailable" }));
    }
  }
  // ---------- evidence deliberation ----------
  const progress = reactive({}); // runId -> { stage, detail }
  const deliberating = new Set();
  function evidenceOptions(sessionId) {
    const library = useLibrary();
    return { apiKey: apiKey.value.trim(), model: settings.model, seed: settings.seed, useWeb: settings.web, searchLibrary: (queries) => library.searchSources(queries, sessionId) };
  }
  function startEvidence(runId, prompt, sessionId) {
    return gatherEvidence({ ...evidenceOptions(sessionId), prompt, onEvent: (event) => (progress[runId] = event) }).catch((error) => ({ error }));
  }
  async function deliberate(runId, prefetched = null) {
    const record = records[runId];
    if (!record || record.mode !== "openai" || record.analysis?.inScope !== true || deliberating.has(runId)) return;
    deliberating.add(runId);
    progress[runId] ??= { stage: "planning", detail: "starting" };
    let deliberation;
    try {
      deliberation = await runDeliberation({
        ...evidenceOptions(record.sessionId),
        evidence: prefetched,
        prompt: record.prompt,
        onEvent: (event) => (progress[runId] = event),
      });
      // Output moderation over every generated sentence; flagged text is removed, numbers kept.
      const texts = [deliberation.consensus.decision, deliberation.consensus.calculation, ...deliberation.consensus.key_points.map((p) => p.text),
        ...deliberation.openings.flatMap((o) => [o.position, o.calculation, ...o.claims.map((c) => c.text)]),
        ...deliberation.rebuttals.flatMap((r) => [r.revised_position, ...r.responses.map((x) => x.point)])];
      useLibrary().rememberCited(record.sessionId, deliberation);
      if ((await moderate(apiKey.value.trim(), texts.join("\n"))).length) deliberation = { ...deliberation, redacted: true, openings: [], rebuttals: [], consensus: { ...deliberation.consensus, decision: "", calculation: "", key_points: [] } };
    } catch (error) {
      if (error.code === "auth") keyStatus.value = "invalid";
      deliberation = { error: error.code ?? "unavailable" };
    } finally {
      delete progress[runId];
      deliberating.delete(runId);
    }
    const current = records[runId];
    if (!current) return;
    const { fingerprint, schemaVersion, disclaimer, ...fields } = current;
    return saveRecord(await createRecord({ ...fields, deliberation }));
  }

  // Re-run always bypasses the cache so researchers can sample a fresh answer.
  async function retry(run, session) {
    const record = records[run.id];
    if (!record) return;
    return analyze({ run, session, guardrails: record.guardrails, fresh: true });
  }

  // ---------- export / delete ----------
  function exportRecords(list, format, name) {
    if (format === "csv") downloadText(`${name}.csv`, "text/csv;charset=utf-8", recordsToCsv(list));
    else downloadText(`${name}.json`, "application/json", JSON.stringify({ exportedAt: new Date().toISOString(), app: "lookahead", records: list }, null, 2));
  }
  function exportRun(runId, format) {
    pruneRecords();
    if (records[runId]) exportRecords([records[runId]], format, `lookahead-run-${runId.slice(0, 8)}-${stamp()}`);
  }
  function exportAll(format) {
    pruneRecords();
    const list = Object.values(records).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    exportRecords(list, format, `lookahead-records-${stamp()}`);
  }
  async function deleteAllData() {
    await recordStorage.clear().catch(() => {});
    safely(() => indexedDB.deleteDatabase("microfish-embeddings"));
    safely(() => indexedDB.deleteDatabase("microfish-library"));
    // Every key lookahead writes (internal names keep the original "microfish" prefix); keep in sync when adding persisted state.
    for (const key of [WORKSPACE_KEY, SETTINGS_KEY, "microfish:preflight", "microfish:timeline", "microfish:study-build", "microfish:library", "microfish:cloud-backup"]) {
      safely(() => window.localStorage.removeItem(key));
    }
    safely(() => window.sessionStorage.clear());
    window.location.reload();
  }

  instance = {
    settings, apiKey, keyStatus, keyError, models, persistent, ready, modeLabel,
    records, status, progress, testKey, forgetKey, check, analyze, retry, deliberate,
    exportRun, exportAll, deleteAllData,
    recordCount: computed(() => Object.keys(records).length),
  };
  return instance;
}
