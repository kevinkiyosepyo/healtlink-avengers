<script setup>
// Study build: protocol → schedule of activities, draft CRF, edit checks and
// burden; source note → extracted values and auto-generated queries.
import { computed, ref, watch } from "vue";
import { Download, FlaskConical, Play } from "@lucide/vue";
import StatusBadge from "./StatusBadge.vue";
import { SAMPLE_DAY0, SAMPLE_PROTOCOL, SAMPLE_SOURCE, buildStudy, extractSource, generateQueries } from "../lib/studyBuild.js";
import { createArtifact, csvCell } from "../lib/records.js";
import { downloadText, stamp } from "../lib/download.js";
import { readJson, writeJson } from "../lib/storage.js";

const emit = defineEmits(["rehearse"]);
const STORAGE_KEY = "microfish:study-build";
const saved = readJson(STORAGE_KEY, {});
const protocol = ref(saved.protocol ?? SAMPLE_PROTOCOL);
const source = ref(saved.source ?? SAMPLE_SOURCE);
const day0 = ref(saved.day0 ?? SAMPLE_DAY0);
const build = ref(buildStudy(protocol.value));
const buildStale = ref(false);
const visitId = ref(saved.visitId ?? "v3");
const extraction = ref(null);
const queries = ref([]);
const checked = ref(false);

watch([protocol, source, day0, visitId], () =>
  writeJson(STORAGE_KEY, { protocol: protocol.value, source: source.value, day0: day0.value, visitId: visitId.value }),
);
watch(protocol, () => (buildStale.value = true));
watch([source, day0, visitId], () => (checked.value = false));

function runBuild() {
  build.value = buildStudy(protocol.value);
  buildStale.value = false;
  if (!build.value.visits.some((v) => v.id === visitId.value)) visitId.value = build.value.visits[0]?.id ?? "";
  checked.value = false;
}
function runSourceCheck() {
  extraction.value = extractSource(build.value, visitId.value, source.value);
  queries.value = generateQueries(extraction.value, { day0Date: day0.value });
  checked.value = true;
}
function reset() {
  protocol.value = SAMPLE_PROTOCOL;
  source.value = SAMPLE_SOURCE;
  day0.value = SAMPLE_DAY0;
  visitId.value = "v3";
  runBuild();
}

const b = computed(() => build.value);
const hours = (min) => (min / 60).toFixed(min % 60 ? 1 : 0);
const maxVisitMin = computed(() => Math.max(1, ...b.value.burden.map((x) => x.participantMin)));
const heaviest = computed(() => {
  const top = [...b.value.burden].sort((x, y) => y.participantMin - x.participantMin)[0];
  return top ? { ...top, visit: b.value.visits.find((v) => v.id === top.visit) } : null;
});
const fieldStatus = computed(() => {
  if (!extraction.value) return [];
  const byField = Object.fromEntries(queries.value.filter((q) => q.field).map((q) => [q.field, q]));
  return extraction.value.fields.map((field) => ({ field, entry: extraction.value.values[field.name], query: byField[field.name] }));
});

function rehearse() {
  const v = heaviest.value;
  const prompt = `REST-101 has ${b.value.visits.length} visits — about ${hours(b.value.totals.participantMin)} participant hours and ${hours(b.value.totals.siteMin)} site staff hours per participant. The heaviest is ${v.visit.name} (${v.participantMin} participant minutes). What happens to retention, data quality and site workload if ${v.visit.name} becomes a remote visit with home sample collection?`;
  emit("rehearse", prompt);
}

// ---------- export ----------
function exportCrf() {
  const header = ["form", "field", "label", "type", "unit", "min", "max", "required", "collected_at"];
  const rows = [header.join(",")];
  for (const form of b.value.forms) {
    const at = b.value.visits.filter((v) => v.assessments.includes(form.id)).map((v) => v.name).join("; ");
    for (const f of form.fields) rows.push([form.id, f.name, f.label, f.type, f.unit, f.min, f.max, f.required, at].map(csvCell).join(","));
  }
  downloadText(`microfish-crf-spec-${stamp()}.csv`, "text/csv;charset=utf-8", rows.join("\n"));
}
async function exportJson() {
  const data = {
    tool: "study-build",
    build: b.value,
    sourceCheck: checked.value ? { visit: visitId.value, day0: day0.value, values: extraction.value.values, visitDate: extraction.value.visitDate, queries: queries.value } : null,
    assumptions: "Assessment durations and ranges come from a built-in demo library unless the protocol overrides them. Illustrative, not a validated EDC build.",
  };
  downloadText(`microfish-study-build-${stamp()}.json`, "application/json", JSON.stringify(await createArtifact("study-build", data), null, 2));
}

const heading = ref(null);
defineExpose({ focusHeading: () => heading.value?.focus() });
</script>

<template>
  <div class="tool-page">
    <header class="tool-head">
      <div>
        <p class="mono eyebrow">study setup · data monitoring</p>
        <h1 ref="heading" tabindex="-1">study build</h1>
        <p class="lede">paste the protocol — get the schedule of activities, a draft crf, edit checks and the burden it puts on participants and sites. then drop in a source note and see the queries a monitor would raise.</p>
      </div>
      <div class="head-actions">
        <button class="mini-btn mono" @click="exportCrf"><Download :size="12" /> crf spec csv</button>
        <button class="mini-btn mono" @click="exportJson"><Download :size="12" /> json</button>
        <button class="link-btn mono" @click="reset">reset sample</button>
      </div>
    </header>

    <div class="metrics">
      <div class="metric"><span class="mono">visits</span><strong>{{ b.visits.length }}</strong></div>
      <div class="metric"><span class="mono">crf fields</span><strong>{{ b.forms.reduce((n, f) => n + f.fields.length, 0) }}</strong><span class="mono faint">{{ b.forms.length }} forms</span></div>
      <div class="metric"><span class="mono">edit checks</span><strong>{{ b.editChecks.length }}</strong><span class="mono faint">{{ b.overrides.length }} from protocol</span></div>
      <div class="metric"><span class="mono">participant time</span><strong>{{ hours(b.totals.participantMin) }} h</strong><span class="mono faint">site {{ hours(b.totals.siteMin) }} h / participant</span></div>
    </div>

    <div class="tool-grid">
      <section class="panel" aria-label="Protocol">
        <div class="panel-head">
          <span class="mono">protocol · schedule of activities</span>
          <StatusBadge size="sm" :status="buildStale ? 'draft' : b.warnings.length ? 'running' : 'completed'" :label="buildStale ? 'changed' : b.warnings.length ? `${b.warnings.length} warnings` : 'parsed'" />
        </div>
        <textarea v-model="protocol" class="field doc-text mono" spellcheck="false" aria-label="Protocol text"></textarea>
        <p class="hint mono">format: <code>Visit 3 — Week 2 (Day 14 ± 2): vitals, labs</code> · override ranges with <code>Range: systolic_bp 90-150</code></p>
        <div class="panel-foot">
          <button class="primary-btn mono" @click="runBuild"><FlaskConical :size="13" /> build study</button>
        </div>
        <ul v-if="b.warnings.length" class="warnings">
          <li v-for="(w, i) in b.warnings" :key="i"><span class="mono">{{ w.line ? `line ${w.line}` : "protocol" }} —</span> {{ w.message }}</li>
        </ul>
      </section>

      <section class="panel" aria-label="Schedule of activities">
        <div class="panel-head">
          <span class="mono">schedule of activities</span>
          <button v-if="heaviest" class="mini-btn mono" @click="rehearse"><Play :size="12" /> rehearse this burden</button>
        </div>
        <div class="soa-wrap">
          <table class="soa">
            <thead>
              <tr>
                <th class="mono">assessment</th>
                <th v-for="v in b.visits" :key="v.id" class="mono">
                  <span class="vname">{{ v.name }}</span>
                  <span class="vday">d{{ v.day }}{{ v.window ? ` ±${v.window}` : "" }}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="form in b.forms" :key="form.id">
                <td>{{ form.label }}<span v-if="!form.known" class="mono unknown"> · free text</span></td>
                <td v-for="v in b.visits" :key="v.id" class="cell">
                  <span v-if="v.assessments.includes(form.id)" class="mark" :title="`${form.label} at ${v.name}`"></span>
                </td>
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <td class="mono">participant min</td>
                <td v-for="(x, i) in b.burden" :key="x.visit" class="burden-cell">
                  <span class="burden-bar" :class="{ top: heaviest && x.visit === heaviest.visit.id }" :style="{ height: `${(x.participantMin / maxVisitMin) * 44}px` }"></span>
                  <span class="mono">{{ x.participantMin }}</span>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
        <details class="checks">
          <summary class="mono">{{ b.editChecks.length }} edit checks derived from the protocol</summary>
          <ul>
            <li v-for="(c, i) in b.editChecks" :key="i"><span class="mono">{{ c.type }}</span> {{ c.rule }}</li>
          </ul>
        </details>
      </section>

      <section class="panel wide" aria-label="Source check">
        <div class="panel-head">
          <span class="mono">source check · auto queries</span>
          <StatusBadge
            v-if="checked"
            size="sm"
            :status="queries.some((q) => q.severity === 'high') ? 'error' : queries.length ? 'running' : 'completed'"
            :label="queries.length ? `${queries.length} queries` : 'clean'"
          />
        </div>
        <div class="source-grid">
          <div class="source-in">
            <div class="source-fields">
              <label class="mono">visit
                <select v-model="visitId" class="field mono">
                  <option v-for="v in b.visits" :key="v.id" :value="v.id">{{ v.name }} (day {{ v.day }})</option>
                </select>
              </label>
              <label class="mono">day 0 date
                <input v-model="day0" class="field mono" type="date" />
              </label>
            </div>
            <textarea v-model="source" class="field source-text mono" spellcheck="false" aria-label="Source note"></textarea>
            <div class="panel-foot">
              <button class="primary-btn mono" :disabled="buildStale" @click="runSourceCheck">check source</button>
              <span v-if="buildStale" class="mono faint">rebuild the study first</span>
            </div>
          </div>
          <div class="source-out">
            <p v-if="!checked" class="hint mono">extracted values and queries appear here. nothing leaves your browser.</p>
            <template v-else>
              <table class="extract">
                <thead class="mono"><tr><th>field</th><th>value</th><th>status</th></tr></thead>
                <tbody>
                  <tr v-for="row in fieldStatus" :key="row.field.name">
                    <td>{{ row.field.label }}<span v-if="row.field.required" class="req">*</span></td>
                    <td class="code-text">{{ row.entry ? `${row.entry.raw}${row.field.unit ? ` ${row.field.unit}` : ""}` : "—" }}</td>
                    <td>
                      <StatusBadge size="sm" :status="row.query ? (row.query.severity === 'high' ? 'error' : 'running') : row.entry ? 'completed' : 'draft'" :label="row.query ? row.query.type : row.entry ? 'ok' : 'optional'" />
                    </td>
                  </tr>
                </tbody>
              </table>
              <ul class="queries">
                <li v-for="(q, i) in queries" :key="i" :class="`q-${q.severity}`">
                  <span class="mono qtag">query · {{ q.severity }}</span>
                  <p>{{ q.message }}</p>
                  <p v-if="q.source" class="mono qsrc">source line {{ q.source.line }}: <code>{{ q.source.quote }}</code></p>
                </li>
              </ul>
            </template>
          </div>
        </div>
      </section>
    </div>
    <p class="scope mono">deterministic rules over a demo assessment library · ranges and durations are illustrative · not a validated edc build</p>
  </div>
</template>

<style scoped>
.head-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}
.tool-grid {
  grid-template-columns: minmax(0, 5fr) minmax(0, 7fr);
}
.wide {
  grid-column: 1 / -1;
}
.doc-text {
  height: 230px;
  padding: 8px;
  resize: vertical;
  line-height: 1.55;
}
.hint code,
.qsrc code {
  color: var(--muted);
  font-family: var(--font-mono-stack);
}
.warnings {
  margin: 0;
  padding-left: 16px;
  list-style: disc;
  color: var(--amber);
  font-size: 12.5px;
}
.warnings .mono {
  color: var(--faint);
}
.soa-wrap {
  overflow-x: auto;
}
.soa {
  width: 100%;
  border-collapse: collapse;
  font-size: 12.5px;
}
.soa th {
  padding: 4px 6px 8px;
  border-bottom: 1px solid var(--hairline);
  color: var(--faint);
  font-weight: 400;
  text-align: center;
  vertical-align: bottom;
}
.soa th:first-child,
.soa td:first-child {
  text-align: left;
}
.vname {
  display: block;
  color: var(--muted);
  white-space: nowrap;
}
.vday {
  font-size: 10px;
}
.soa td {
  padding: 6px;
  border-bottom: 1px solid color-mix(in srgb, var(--hairline) 60%, transparent);
  color: var(--body);
}
.cell {
  text-align: center;
}
.mark {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--kg-site);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--kg-site) 18%, transparent);
}
.unknown {
  color: var(--amber);
}
.burden-cell {
  text-align: center;
  vertical-align: bottom;
}
.burden-cell .mono {
  display: block;
  color: var(--faint);
  font-size: 10.5px;
}
.burden-bar {
  display: block;
  width: 14px;
  margin: 6px auto 4px;
  border-radius: 3px 3px 0 0;
  background: color-mix(in srgb, var(--muted) 45%, var(--surface));
  transition: height 300ms var(--ease);
}
.burden-bar.top {
  background: color-mix(in srgb, var(--accent) 75%, var(--surface));
}
.checks summary {
  color: var(--faint);
  cursor: pointer;
}
.checks ul {
  display: grid;
  gap: 2px;
  max-height: 160px;
  margin: 8px 0 0;
  padding: 0;
  overflow-y: auto;
  list-style: none;
  color: var(--body);
  font-size: 12px;
}
.checks .mono {
  display: inline-block;
  width: 64px;
  color: var(--faint);
}
.source-grid {
  display: grid;
  grid-template-columns: minmax(0, 5fr) minmax(0, 7fr);
  gap: 16px;
}
.source-in {
  display: grid;
  gap: 8px;
  align-content: start;
}
.source-fields {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.source-fields label {
  display: grid;
  gap: 4px;
  color: var(--faint);
}
.source-text {
  height: 170px;
  padding: 8px;
  resize: vertical;
  line-height: 1.55;
}
.extract {
  width: 100%;
  border-collapse: collapse;
  font-size: 12.5px;
}
.extract th {
  padding: 4px;
  border-bottom: 1px solid var(--hairline);
  color: var(--faint);
  font-weight: 400;
  text-align: left;
}
.extract td {
  padding: 5px 4px;
  border-bottom: 1px solid color-mix(in srgb, var(--hairline) 60%, transparent);
  color: var(--body);
}
.req {
  color: var(--accent);
}
.queries {
  display: grid;
  gap: 8px;
  margin: 12px 0 0;
  padding: 0;
  list-style: none;
}
.queries li {
  padding: 10px 12px;
  border: 1px solid var(--hairline);
  border-left: 2px solid var(--muted);
  border-radius: 6px;
  background: var(--canvas);
}
.queries li.q-high {
  border-left-color: var(--danger);
}
.queries li.q-medium {
  border-left-color: var(--accent);
}
.qtag {
  color: var(--faint);
}
.queries p {
  margin: 4px 0 0;
  color: var(--body);
  font-size: 13px;
  line-height: 1.5;
}
.qsrc {
  color: var(--faint);
  font-size: 11px !important;
}
@media (max-width: 900px) {
  .tool-grid,
  .source-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
