<script setup>
import { computed, ref } from "vue";
import { ChevronDown, Copy, Download, RotateCcw } from "@lucide/vue";
import StatusBadge from "./StatusBadge.vue";
import { AGENTS, STANCE_LEVELS, agentId, stanceColor } from "../lib/agents.js";
import { ERROR_COPY } from "../composables/useResearch.js";
import { BLOCK_REASONS } from "../lib/guardrails.js";

const props = defineProps({
  record: { type: Object, default: null },
  status: { type: String, default: "" }, // analyzing | ready | blocked | error
  latest: { type: Boolean, default: false },
});
const emit = defineEmits(["retry", "export", "graph"]);

const showWhy = ref(new Set());
const showProvenance = ref(false);
const copied = ref(false);

const isOpenAi = computed(() => props.record?.mode === "openai");
const p = computed(() => props.record?.provenance ?? {});
const rows = computed(() => {
  const stances = props.record?.analysis?.stances ?? {};
  return AGENTS.map((agent, index) => ({ ...agent, id: agentId(index), stance: stances[agentId(index)] }))
    .filter((row, index) => index > 0 && row.stance);
});
const summary = computed(() => {
  const scores = rows.value.map((row) => row.stance.score);
  if (!scores.length) return null;
  const mean = scores.reduce((sum, value) => sum + value, 0) / scores.length;
  return {
    mean,
    supportive: scores.filter((value) => value > 2).length,
    neutral: scores.filter((value) => value === 2).length,
    opposed: scores.filter((value) => value < 2).length,
  };
});
const badge = computed(() => {
  const latency = p.value.latencyMs != null ? `${(p.value.latencyMs / 1000).toFixed(1)}s` : null;
  switch (props.status) {
    case "analyzing":
      return { status: "running", label: "analyzing", meta: [p.value.requestedModel || "openai"] };
    case "blocked":
      return { status: "error", label: "out of scope", meta: [] };
    case "error":
      return { status: "error", label: "analysis failed", meta: [] };
    default:
      return {
        status: "completed",
        label: "analysis ready",
        meta: [p.value.cached ? "cached" : latency, p.value.model].filter(Boolean),
      };
  }
});
function toggleWhy(id) {
  const next = new Set(showWhy.value);
  next.has(id) ? next.delete(id) : next.add(id);
  showWhy.value = next;
}
async function copyFingerprint() {
  try {
    await navigator.clipboard.writeText(props.record.fingerprint);
    copied.value = true;
    setTimeout(() => (copied.value = false), 1500);
  } catch {
    /* clipboard blocked: the full value is still visible */
  }
}
const time = computed(() => (props.record ? new Date(props.record.createdAt).toLocaleString() : ""));
</script>

<template>
  <section v-if="record || status === 'analyzing'" class="analysis" aria-label="Analysis">
    <!-- demo runs: a saved record, clearly labelled -->
    <div v-if="record && !isOpenAi" class="analysis-demo">
      <span class="mono">record saved · demo playback · 12 illustrative agents · no model called</span>
      <span class="analysis-actions">
        <button class="mini-btn" @click="emit('export', 'json')"><Download :size="12" /> json</button>
      </span>
    </div>

    <template v-else>
      <header class="analysis-head">
        <StatusBadge :status="badge.status" :label="badge.label" :meta="badge.meta" />
        <span v-if="status === 'ready'" class="analysis-actions">
          <button class="mini-btn" title="Re-run without cache" @click="emit('retry')"><RotateCcw :size="12" /> re-run fresh</button>
          <button class="mini-btn" @click="emit('export', 'csv')"><Download :size="12" /> csv</button>
          <button class="mini-btn" @click="emit('export', 'json')"><Download :size="12" /> json</button>
        </span>
      </header>

      <p v-if="status === 'analyzing'" class="analysis-note mono">
        scoring 11 stakeholder groups in one structured request · temperature {{ p.temperature ?? "default" }}
      </p>

      <div v-else-if="status === 'error'" class="analysis-error">
        <p>{{ ERROR_COPY[record?.error] ?? ERROR_COPY.unavailable }}</p>
        <button class="mini-btn" @click="emit('retry')"><RotateCcw :size="12" /> retry analysis</button>
      </div>

      <p v-else-if="status === 'blocked'" class="analysis-note">
        {{ BLOCK_REASONS[record?.analysis?.reason] ?? BLOCK_REASONS.off_topic }}
      </p>

      <template v-else-if="status === 'ready' && rows.length">
        <div v-if="summary" class="analysis-summary mono">
          <span><b>{{ summary.supportive }}</b> supportive</span>
          <span><b>{{ summary.neutral }}</b> neutral</span>
          <span><b>{{ summary.opposed }}</b> opposed</span>
          <span>mean <b>{{ summary.mean.toFixed(2) }}</b>/4</span>
          <button v-if="latest" class="glyph-link" @click="emit('graph')">view in graph</button>
        </div>

        <table class="stance-table">
          <thead class="mono">
            <tr><th>stakeholder</th><th>likely stance</th><th class="num">conf.</th><th></th></tr>
          </thead>
          <tbody>
            <template v-for="row in rows" :key="row.id">
              <tr>
                <td>
                  <span class="cat" :style="{ background: `var(--kg-${row.category})` }"></span>{{ row.label }}
                </td>
                <td>
                  <span class="scale" :aria-label="`${STANCE_LEVELS[row.stance.score]} (${row.stance.score} of 4)`">
                    <i v-for="step in 5" :key="step" :class="{ on: step - 1 === row.stance.score }" :style="step - 1 === row.stance.score ? { background: stanceColor(row.stance.score) } : null"></i>
                  </span>
                  <span class="stance-label">{{ STANCE_LEVELS[row.stance.score] }}</span>
                </td>
                <td class="num mono">{{ row.stance.confidence != null ? `${Math.round(row.stance.confidence * 100)}%` : "—" }}</td>
                <td class="why-cell">
                  <button v-if="row.stance.rationale" class="why-btn mono" :aria-expanded="showWhy.has(row.id)" @click="toggleWhy(row.id)">
                    why <ChevronDown :size="12" :class="{ flip: showWhy.has(row.id) }" />
                  </button>
                </td>
              </tr>
              <tr v-if="showWhy.has(row.id)" class="why-row">
                <td colspan="4">{{ row.stance.rationale }}</td>
              </tr>
            </template>
          </tbody>
        </table>

        <div v-if="record.analysis.assumptions?.length || record.analysis.caveats?.length" class="analysis-lists">
          <div v-if="record.analysis.assumptions?.length">
            <p class="mono">assumptions</p>
            <ul><li v-for="(item, index) in record.analysis.assumptions" :key="index">{{ item }}</li></ul>
          </div>
          <div v-if="record.analysis.caveats?.length">
            <p class="mono">caveats</p>
            <ul><li v-for="(item, index) in record.analysis.caveats" :key="index">{{ item }}</li></ul>
          </div>
        </div>
        <p v-if="record.analysis.redacted" class="analysis-note mono">explanations removed: moderation flagged the generated text.</p>
        <p class="analysis-note mono">model estimates from general knowledge — uncited, confidence self-reported. verify before use.</p>
      </template>

      <div v-if="record && status !== 'analyzing'" class="provenance">
        <button class="why-btn mono" :aria-expanded="showProvenance" @click="showProvenance = !showProvenance">
          provenance <ChevronDown :size="12" :class="{ flip: showProvenance }" />
        </button>
        <dl v-if="showProvenance" class="mono">
          <dt>created</dt><dd>{{ time }}</dd>
          <dt>model</dt><dd>{{ p.model || p.requestedModel || "—" }}<template v-if="p.model && p.requestedModel && p.model !== p.requestedModel"> (requested {{ p.requestedModel }})</template></dd>
          <dt>params</dt><dd>temperature {{ p.temperature ?? "default" }} · seed {{ p.seed ?? "—" }} · {{ p.promptVersion }}</dd>
          <dt>openai</dt><dd>fingerprint {{ p.systemFingerprint || "—" }} · tokens {{ p.usage ? `${p.usage.input} in / ${p.usage.output} out` : "—" }}</dd>
          <dt>timing</dt><dd>{{ p.latencyMs != null ? `${p.latencyMs} ms` : "—" }}<template v-if="p.cached"> · cached from run {{ p.cachedFrom?.slice(0, 8) }}</template></dd>
          <dt>guardrails</dt><dd>local {{ record.guardrails?.local }} · moderation {{ record.guardrails?.moderation }} · scope {{ record.guardrails?.scope ?? "—" }}</dd>
          <dt>record</dt>
          <dd class="fp">
            <span :title="record.fingerprint">sha-256 {{ record.fingerprint.slice(0, 16) }}…</span>
            <button class="mini-btn" :aria-label="copied ? 'Copied' : 'Copy fingerprint'" @click="copyFingerprint"><Copy :size="11" /> {{ copied ? "copied" : "copy" }}</button>
          </dd>
        </dl>
      </div>
    </template>
  </section>
</template>

<style scoped>
.analysis {
  margin-top: 10px;
  padding: 12px 14px;
  border: 1px solid var(--hairline);
  border-radius: 8px;
  background: var(--surface);
}
.analysis-demo {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: var(--faint);
}
.analysis-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.analysis-actions {
  display: inline-flex;
  gap: 4px;
}
.analysis-note {
  margin: 10px 0 0;
  color: var(--faint);
  font-size: 11.5px;
  line-height: 1.5;
}
p.analysis-note:not(.mono) {
  color: var(--body);
  font-size: 13.5px;
}
.analysis-error {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 10px;
  color: var(--body);
  font-size: 13.5px;
}
.analysis-error p {
  margin: 0;
}
.analysis-summary {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 16px;
  margin: 12px 0 8px;
  color: var(--faint);
}
.analysis-summary b {
  color: var(--ink);
  font-weight: 500;
}
.analysis-summary .glyph-link {
  margin-left: auto;
  font-family: var(--font-mono-stack);
  font-size: 11.5px;
}
.stance-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.stance-table th {
  padding: 6px 4px;
  border-bottom: 1px solid var(--hairline);
  color: var(--faint);
  font-weight: 400;
  text-align: left;
}
.stance-table td {
  padding: 7px 4px;
  border-bottom: 1px solid color-mix(in srgb, var(--hairline) 60%, transparent);
  color: var(--body);
  vertical-align: middle;
}
.stance-table .num {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.cat {
  display: inline-block;
  width: 7px;
  height: 7px;
  margin-right: 8px;
  border-radius: 999px;
}
.scale {
  display: inline-flex;
  gap: 2px;
  margin-right: 8px;
  vertical-align: middle;
}
.scale i {
  width: 10px;
  height: 6px;
  border-radius: 2px;
  background: var(--hairline);
}
.stance-label {
  color: var(--muted);
  font-size: 12.5px;
}
.why-cell {
  width: 1%;
  text-align: right;
  white-space: nowrap;
}
.why-btn {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 4px;
  border: 0;
  border-radius: 4px;
  background: none;
  color: var(--faint);
  font-size: 11px;
}
.why-btn:hover {
  color: var(--ink);
}
.why-btn .flip {
  transform: rotate(180deg);
}
.why-row td {
  padding: 2px 4px 10px 19px;
  color: var(--muted);
  font-size: 12.5px;
  line-height: 1.55;
}
.analysis-lists {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
  margin-top: 12px;
}
.analysis-lists p {
  margin: 0 0 4px;
  color: var(--faint);
}
.analysis-lists ul {
  margin: 0;
  padding-left: 16px;
  list-style: disc;
  color: var(--body);
  font-size: 12.5px;
  line-height: 1.55;
}
.provenance {
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px solid var(--hairline);
}
.provenance dl {
  display: grid;
  grid-template-columns: 84px 1fr;
  gap: 4px 12px;
  margin: 8px 0 0;
  font-size: 11px;
}
.provenance dt {
  color: var(--faint);
}
.provenance dd {
  margin: 0;
  overflow-wrap: anywhere;
  color: var(--muted);
}
.provenance .fp {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
@media (max-width: 640px) {
  .stance-label {
    display: none;
  }
}
</style>
