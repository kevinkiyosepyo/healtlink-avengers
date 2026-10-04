<script setup>
// Consensus, debate and provenance for one run's evidence deliberation.
// Citation chips jump to the source's row in the provenance tab.
import { computed, nextTick, ref } from "vue";
import { Download, ExternalLink, RotateCcw, Volume2, VolumeX } from "@lucide/vue";
import StatusBadge from "./StatusBadge.vue";
import StatusIcon from "./StatusIcon.vue";
import { ERROR_COPY } from "../composables/useResearch.js";
import { csvCell } from "../lib/records.js";
import { downloadText, stamp } from "../lib/download.js";
import { consensusScript, speak, stopSpeaking } from "../lib/voice.js";

const props = defineProps({
  deliberation: { type: Object, default: null },
  progress: { type: Object, default: null }, // { stage, detail } while running
  canRun: { type: Boolean, default: false },
});
const emit = defineEmits(["deliberate"]);

const STAGES = ["planning", "retrieving", "opening", "rebuttal", "consensus"];
const STAGE_LABELS = { planning: "plan", retrieving: "evidence (scholarly · library · web, in parallel)", opening: "opening positions", rebuttal: "rebuttals", consensus: "consensus" };
const RECOMMENDATION = {
  proceed: { status: "completed", label: "proceed" },
  proceed_with_changes: { status: "running", label: "proceed with changes" },
  do_not_proceed: { status: "error", label: "do not proceed" },
  insufficient_evidence: { status: "draft", label: "insufficient evidence" },
};
const STANCE = { agree: "completed", partly: "running", disagree: "error" };

const tab = ref("consensus");
const speaking = ref(false);
function toggleListen() {
  if (speaking.value) {
    stopSpeaking();
    speaking.value = false;
  } else {
    speaking.value = speak(consensusScript(d.value), { onEnd: () => (speaking.value = false) });
  }
}
const highlighted = ref(null);
const openReasons = ref(new Set());
const d = computed(() => props.deliberation);
const ready = computed(() => d.value && !d.value.error && d.value.consensus);
const panelLabel = computed(() => Object.fromEntries((d.value?.panel ?? []).map((a) => [a.id, a.label])));
const bySid = computed(() => Object.fromEntries((d.value?.pack ?? []).map((s) => [s.sid, s])));
const unit = computed(() => d.value?.metric?.unit ?? "");

// Which claims cite each source — the reverse map researchers ask for.
const citedBy = computed(() => {
  const map = {};
  const add = (sids, where) => sids.forEach((sid) => (map[sid] ??= []).push(where));
  for (const point of d.value?.consensus?.key_points ?? []) add(point.sources, "consensus");
  for (const o of d.value?.openings ?? []) for (const c of o.claims) add(c.sources, panelLabel.value[o.agent]);
  for (const r of d.value?.rebuttals ?? []) for (const x of r.responses) add(x.sources, `${panelLabel.value[r.agent]} (rebuttal)`);
  for (const sid of Object.keys(map)) map[sid] = [...new Set(map[sid])];
  return map;
});

async function showSource(sid) {
  tab.value = "provenance";
  highlighted.value = sid;
  await nextTick();
  document.getElementById(`src-${sid}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
}
function toggleReasons(sid) {
  const next = new Set(openReasons.value);
  next.has(sid) ? next.delete(sid) : next.add(sid);
  openReasons.value = next;
}
const fmt = (e) => (e ? `${e.value} ${unit.value} (${e.low} to ${e.high})` : "—");

function exportSources() {
  const header = ["sid", "title", "database", "type", "year", "venue", "credibility", "tier", "credibility_reasons", "url", "doi", "pmid", "nct", "library_location", "cited_by", "found_by_query"];
  const rows = [header.join(",")];
  for (const s of d.value.pack) {
    rows.push([s.sid, s.title, s.database, s.studyTypes.join("; "), s.year, s.venue, s.credibility.score, s.credibility.tier, s.credibility.reasons.join("; "), s.url, s.doi, s.pmid, s.nct, s.location ? `${s.venue}${s.location.page ? ` p.${s.location.page}` : ""} line ${s.location.line}` : "", (citedBy.value[s.sid] ?? []).join("; "), s.foundBy?.query].map(csvCell).join(","));
  }
  downloadText(`lookahead-evidence-${stamp()}.csv`, "text/csv;charset=utf-8", rows.join("\n"));
}
</script>

<template>
  <section class="evidence" aria-label="Evidence deliberation">
    <!-- running -->
    <div v-if="progress" class="ev-progress">
      <StatusBadge status="running" label="deliberating" :meta="progress.detail" />
      <ol class="stepper mono">
        <li v-for="stage in STAGES" :key="stage" :class="{ done: STAGES.indexOf(stage) < STAGES.indexOf(progress.stage), now: stage === progress.stage }">
          <StatusIcon :status="STAGES.indexOf(stage) < STAGES.indexOf(progress.stage) ? 'completed' : stage === progress.stage ? 'running' : 'draft'" :size="12" />
          {{ STAGE_LABELS[stage] }}
        </li>
      </ol>
    </div>

    <!-- failed / not run -->
    <div v-else-if="!ready" class="ev-empty">
      <p v-if="d?.error">evidence deliberation failed — {{ ERROR_COPY[d.error] ?? ERROR_COPY.unavailable }}</p>
      <p v-else-if="d?.redacted">moderation flagged the generated debate, so its text was removed.</p>
      <p v-else class="mono">no evidence deliberation for this run yet.</p>
      <button v-if="canRun" class="mini-btn" @click="emit('deliberate')"><RotateCcw :size="12" /> {{ d ? "retry" : "deliberate with evidence" }}</button>
    </div>

    <template v-else>
      <div class="ev-tabs segmented mono" role="tablist">
        <button v-for="t in ['consensus', 'debate', 'provenance']" :key="t" role="tab" :aria-selected="tab === t" :class="{ active: tab === t }" @click="tab = t">
          {{ t }}<template v-if="t === 'provenance'"> · {{ d.pack.length }}</template>
        </button>
      </div>

      <!-- consensus -->
      <div v-if="tab === 'consensus'" class="ev-body">
        <div class="ev-head">
          <StatusBadge variant="chip" v-bind="RECOMMENDATION[d.consensus.recommendation]" :meta="[`confidence ${Math.round(d.consensus.confidence * 100)}%`]" />
          <span class="ev-head-right">
            <span class="mono faint">{{ d.panel.length }} agents · {{ d.pack.length }} sources · {{ (d.latencyMs / 1000).toFixed(0) }}s</span>
            <button class="mini-btn" type="button" :aria-pressed="speaking" @click="toggleListen">
              <VolumeX v-if="speaking" :size="12" /><Volume2 v-else :size="12" /> {{ speaking ? "stop" : "listen" }}
            </button>
          </span>
        </div>
        <p class="decision">{{ d.consensus.decision }}</p>

        <div class="estimates">
          <div class="est">
            <span class="mono faint">panel estimate · {{ d.metric.name }}</span>
            <strong>{{ fmt(d.consensus.estimate) }}</strong>
          </div>
          <div v-if="d.computed" class="est">
            <span class="mono faint">cross-check (computed, not model-written)</span>
            <strong>{{ d.computed.weightedMean }} {{ unit }}</strong>
            <span class="mono faint">median {{ d.computed.median }} · range {{ d.computed.min }} to {{ d.computed.max }} · agreement {{ Math.round(d.computed.agreement * 100) }}%</span>
          </div>
        </div>
        <p v-if="d.consensus.calculation" class="calc code-text">{{ d.consensus.calculation }}</p>

        <p class="mono label">key points</p>
        <ul class="points">
          <li v-for="(point, i) in d.consensus.key_points" :key="i">
            {{ point.text }}
            <button v-for="sid in point.sources" :key="sid" class="chip mono" :title="bySid[sid]?.title" @click="showSource(sid)">{{ sid }}</button>
            <span v-if="point.uncited" class="chip warn mono">uncited</span>
          </li>
        </ul>
        <template v-if="d.consensus.dissent.length">
          <p class="mono label">dissent</p>
          <ul class="points"><li v-for="(x, i) in d.consensus.dissent" :key="i"><span class="mono faint">{{ panelLabel[x.agent] ?? x.agent }} —</span> {{ x.point }}</li></ul>
        </template>
        <template v-if="d.consensus.evidence_gaps.length">
          <p class="mono label">evidence gaps</p>
          <ul class="points"><li v-for="(g, i) in d.consensus.evidence_gaps" :key="i">{{ g }}</li></ul>
        </template>
        <p class="mono faint audit">
          citation audit: {{ d.citationAudit.invalidDropped }} invalid citation{{ d.citationAudit.invalidDropped === 1 ? "" : "s" }} dropped · {{ d.citationAudit.uncited }} uncited claim{{ d.citationAudit.uncited === 1 ? "" : "s" }} flagged
        </p>
      </div>

      <!-- debate -->
      <div v-else-if="tab === 'debate'" class="ev-body">
        <article v-for="(opening, i) in d.openings" :key="opening.agent" class="agent">
          <header class="agent-head">
            <strong>{{ panelLabel[opening.agent] }}</strong>
            <span class="mono faint">opening {{ fmt(opening.estimate) }} → final {{ fmt(d.rebuttals[i]?.revised_estimate) }}</span>
            <StatusBadge v-if="d.rebuttals[i]?.changed_mind" size="sm" status="running" label="changed mind" />
          </header>
          <p>{{ opening.position }}</p>
          <ul class="points">
            <li v-for="(c, j) in opening.claims" :key="j">
              <span class="mono faint">{{ c.strength }} —</span> {{ c.text }}
              <button v-for="sid in c.sources" :key="sid" class="chip mono" @click="showSource(sid)">{{ sid }}</button>
              <span v-if="c.uncited" class="chip warn mono">uncited</span>
            </li>
          </ul>
          <p v-if="opening.calculation" class="calc code-text">{{ opening.calculation }}</p>
          <template v-if="d.rebuttals[i]">
            <p class="mono label">rebuttal</p>
            <ul class="points">
              <li v-for="(x, j) in d.rebuttals[i].responses" :key="j">
                <StatusBadge size="sm" :status="STANCE[x.stance]" :label="`${x.stance} · ${panelLabel[x.to] ?? x.to}`" />
                {{ x.point }}
                <button v-for="sid in x.sources" :key="sid" class="chip mono" @click="showSource(sid)">{{ sid }}</button>
              </li>
            </ul>
            <p class="revised"><span class="mono faint">revised —</span> {{ d.rebuttals[i].revised_position }}</p>
          </template>
        </article>
      </div>

      <!-- provenance -->
      <div v-else class="ev-body">
        <ol class="pipeline">
          <li>
            <span class="mono label">1 · queries planned by the model</span>
            <span class="code-text">{{ d.queries.join("  ·  ") }}</span>
          </li>
          <li>
            <span class="mono label">2 · scholarly databases (primary)</span>
            <ul class="log mono">
              <li v-for="(entry, i) in d.retrieval.log" :key="i">
                <StatusBadge size="sm" :status="entry.ok ? 'completed' : 'error'" :label="entry.database" :meta="entry.ok ? `${entry.count} results` : entry.error" />
                <a :href="entry.url" target="_blank" rel="noopener noreferrer" class="faint">“{{ entry.query }}” <ExternalLink :size="10" /></a>
              </li>
            </ul>
            <span class="mono faint">{{ d.retrieval.considered }} unique sources · {{ d.retrieval.retractedRemoved }} retracted removed · {{ d.retrieval.irrelevantDropped ?? 0 }} off-topic dropped · top {{ d.pack.filter((s) => s.kind !== "web").length }} kept (60% credibility, 40% relevance)</span>
          </li>
          <li v-if="d.library?.enabled">
            <span class="mono label">3 · your source library (local)</span>
            <span v-if="d.library.error" class="mono faint">unavailable ({{ d.library.error }})</span>
            <span v-else class="mono faint">{{ d.library.used }} passage{{ d.library.used === 1 ? "" : "s" }} matched — only these excerpts were sent to the model</span>
          </li>
          <li>
            <span class="mono label">{{ d.library?.enabled ? 4 : 3 }} · web search (secondary, credibility-filtered)</span>
            <span v-if="d.web.error" class="mono faint">unavailable with this model ({{ d.web.error }}) — scholarly evidence only</span>
            <span v-else class="mono faint">{{ d.web.used }} credible pages kept · {{ d.web.excluded.length }} excluded</span>
            <details v-if="d.web.excluded.length" class="excluded">
              <summary class="mono">excluded links</summary>
              <ul class="mono"><li v-for="(x, i) in d.web.excluded" :key="i"><a :href="x.url" target="_blank" rel="noopener noreferrer">{{ x.credibility.host ?? x.url }}</a> — {{ x.credibility.score }} · {{ x.credibility.reasons.join(", ") }}</li></ul>
            </details>
          </li>
          <li>
            <span class="mono label">{{ d.library?.enabled ? 5 : 4 }} · evidence pack the agents saw</span>
            <button class="mini-btn" @click="exportSources"><Download :size="12" /> sources csv</button>
          </li>
        </ol>

        <ul class="sources">
          <li v-for="s in d.pack" :id="`src-${s.sid}`" :key="s.sid" :class="{ hi: highlighted === s.sid }">
            <div class="src-head">
              <span class="chip mono">{{ s.sid }}</span>
              <a v-if="s.url" :href="s.url" target="_blank" rel="noopener noreferrer" class="src-title">{{ s.title }} <ExternalLink :size="11" /></a>
              <span v-else class="src-title">{{ s.title }}</span>
            </div>
            <p class="faint src-meta" :class="s.kind === 'document' ? 'code-text' : 'mono'">
              <template v-if="s.kind === 'document'">your library · {{ s.venue }}{{ s.location?.page ? ` · page ${s.location.page}` : "" }} · line {{ s.location?.line }} · chars {{ s.location?.start }}–{{ s.location?.end }}</template>
              <template v-else>{{ [s.database, s.studyTypes.slice(0, 2).join(", "), s.year, s.venue, s.status?.toLowerCase(), s.doi ? `doi ${s.doi}` : null, s.pmid ? `pmid ${s.pmid}` : null, s.nct].filter(Boolean).join(" · ") }}</template>
            </p>
            <div class="src-cred">
              <StatusBadge
                size="sm"
                :status="s.credibility.tier === 'high' ? 'completed' : s.credibility.tier === 'moderate' || s.credibility.tier === 'yours' ? 'running' : 'draft'"
                :label="s.kind === 'document' ? 'your source' : `credibility ${s.credibility.score}`"
                :meta="s.kind === 'document' ? 'not externally verified' : s.credibility.tier"
              />
              <button class="link-btn" @click="toggleReasons(s.sid)">{{ openReasons.has(s.sid) ? "hide" : "why" }}</button>
              <span v-if="s.relevance !== null && s.relevance !== undefined" class="mono faint">relevance {{ Math.round(s.relevance * 100) }}%</span>
              <span class="mono faint">cited by {{ (citedBy[s.sid] ?? []).join(", ") || "no one" }}</span>
            </div>
            <ul v-if="openReasons.has(s.sid)" class="reasons mono"><li v-for="(r, i) in s.credibility.reasons" :key="i">{{ r }}</li></ul>
            <p v-if="s.abstract" class="src-abstract">{{ s.abstract }}</p>
          </li>
        </ul>
        <p class="mono faint audit">{{ d.version }} · credibility rules are deterministic and listed per source · abstracts truncated as the agents saw them</p>
      </div>
    </template>
  </section>
</template>

<style scoped>
.evidence {
  margin-top: 10px;
  padding: 12px 14px;
  border: 1px solid var(--hairline);
  border-radius: 8px;
  background: var(--surface);
}
.ev-progress,
.ev-empty {
  display: grid;
  gap: 10px;
  justify-items: start;
  color: var(--body);
  font-size: 13px;
}
.ev-empty p {
  margin: 0;
}
.stepper {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 14px;
  margin: 0;
  padding: 0;
  list-style: none;
  color: var(--faint);
}
.stepper li {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.stepper li.done {
  color: var(--muted);
}
.stepper li.now {
  color: var(--ink);
}
.ev-tabs {
  margin-bottom: 10px;
}
.ev-body {
  display: grid;
  gap: 10px;
  color: var(--body);
  font-size: 13px;
  line-height: 1.55;
}
.ev-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.ev-head-right {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}
.decision {
  margin: 0;
  color: var(--ink);
  font-size: 14.5px;
}
.estimates {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 8px;
}
.est {
  display: grid;
  gap: 4px;
  padding: 10px 12px;
  border: 1px solid var(--hairline);
  border-radius: 8px;
  background: var(--canvas);
}
.est strong {
  color: var(--ink);
  font-size: 16px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}
.calc {
  margin: 0;
  padding: 8px 10px;
  border-left: 2px solid var(--hairline);
  color: var(--muted);
  white-space: pre-wrap;
}
.label {
  margin: 4px 0 0;
  color: var(--faint);
}
.points {
  display: grid;
  gap: 6px;
  margin: 0;
  padding-left: 16px;
  list-style: disc;
}
.chip {
  display: inline-flex;
  align-items: center;
  height: 18px;
  margin-left: 4px;
  padding: 0 6px;
  border: 1px solid color-mix(in srgb, var(--kg-site) 45%, var(--hairline));
  border-radius: 4px;
  background: color-mix(in srgb, var(--kg-site) 12%, transparent);
  color: var(--ink);
  font-size: 10.5px;
  text-transform: none;
  vertical-align: 1px;
  cursor: pointer;
}
.chip.warn {
  border-color: color-mix(in srgb, var(--amber) 50%, var(--hairline));
  background: color-mix(in srgb, var(--amber) 12%, transparent);
  cursor: default;
}
.audit {
  margin: 4px 0 0;
  font-size: 11px;
}
.agent {
  display: grid;
  gap: 6px;
  padding: 10px 0;
  border-top: 1px solid var(--hairline);
}
.agent p {
  margin: 0;
}
.agent-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.agent-head strong {
  color: var(--ink);
  font-weight: 500;
}
.revised {
  color: var(--ink);
}
.pipeline {
  display: grid;
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.pipeline > li {
  display: grid;
  gap: 4px;
  justify-items: start;
}
.log {
  display: grid;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.log li {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.log a,
.excluded a {
  color: var(--faint);
  font-size: 11px;
}
.excluded summary {
  color: var(--faint);
  cursor: pointer;
}
.excluded ul {
  margin: 6px 0 0;
  padding-left: 14px;
  color: var(--faint);
  font-size: 11px;
}
.sources {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.sources > li {
  display: grid;
  gap: 4px;
  padding: 10px 12px;
  border: 1px solid var(--hairline);
  border-radius: 8px;
  background: var(--canvas);
  transition: border-color 300ms var(--ease), box-shadow 300ms var(--ease);
}
.sources > li.hi {
  border-color: color-mix(in srgb, var(--accent) 60%, var(--hairline));
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 15%, transparent);
}
.src-head {
  display: flex;
  align-items: baseline;
  gap: 6px;
}
.src-head .chip {
  margin-left: 0;
  cursor: default;
}
.src-title {
  color: var(--ink);
  font-weight: 500;
  text-decoration: none;
}
.src-title:hover {
  text-decoration: underline;
}
.src-meta {
  margin: 0;
  font-size: 11px;
  overflow-wrap: anywhere;
}
.src-cred {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}
.reasons {
  margin: 0;
  padding-left: 14px;
  color: var(--muted);
  font-size: 11px;
  list-style: disc;
}
.src-abstract {
  margin: 0;
  color: var(--muted);
  font-size: 12.5px;
}
</style>
