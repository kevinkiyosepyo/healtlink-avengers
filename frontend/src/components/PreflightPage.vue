<script setup>
// Document preflight (logic ported from PR #2, lib/documentPreflight.js): local,
// deterministic checks across protocol, consent and onboarding text with exact
// line references. Nothing leaves the browser.
import { computed, ref, watch } from "vue";
import { Download, FileUp, Plus, Trash2, Undo2 } from "@lucide/vue";
import StatusBadge from "./StatusBadge.vue";
import { CHECK_SCOPE, PREFLIGHT_CATEGORIES, analyzePacket, createSamplePacket, inferDocumentVersion } from "../lib/documentPreflight.js";
import { csvCell, createArtifact } from "../lib/records.js";
import { downloadText, stamp } from "../lib/download.js";
import { readJson, writeJson } from "../lib/storage.js";

const STORAGE_KEY = "microfish:preflight";
const MAX_DOCS = 12;
const MAX_DOC_CHARS = 100_000;
const MAX_PACKET_CHARS = 500_000;
const KINDS = [
  { id: "protocol", label: "protocol" },
  { id: "consent", label: "consent form" },
  { id: "onboarding", label: "site onboarding" },
  { id: "training", label: "training record" },
  { id: "other", label: "other" },
];

function load() {
  const saved = readJson(STORAGE_KEY, null);
  return Array.isArray(saved?.documents) ? saved : { documents: createSamplePacket(), reviewed: [], sample: true };
}
const state = ref(load());
const selectedId = ref(state.value.documents[0]?.id ?? null);
const result = ref(analyzePacket(state.value.documents));
const stale = ref(false);
const filter = ref("all");
const expanded = ref(new Set());
const notice = ref("");
const undoSnapshot = ref(null);
const fileInput = ref(null);

watch(
  state,
  () => {
    if (!writeJson(STORAGE_KEY, state.value)) notice.value = "browser storage is full — export your review to keep it.";
  },
  { deep: true },
);

const selected = computed(() => state.value.documents.find((doc) => doc.id === selectedId.value) ?? null);
const reviewed = computed(() => new Set(state.value.reviewed));
const findings = computed(() => result.value.findings.filter((finding) => filter.value === "all" || finding.category === filter.value));
const counts = computed(() => Object.fromEntries(PREFLIGHT_CATEGORIES.map((cat) => [cat.id, result.value.findings.filter((f) => f.category === cat.id).length])));
const high = computed(() => result.value.findings.filter((f) => f.severity === "high").length);
const open = computed(() => result.value.findings.filter((f) => !reviewed.value.has(f.id)).length);
const totalChars = computed(() => state.value.documents.reduce((sum, doc) => sum + doc.text.length, 0));

function markChanged() {
  stale.value = true;
}
function runChecks() {
  result.value = analyzePacket(state.value.documents);
  const live = new Set(result.value.findings.map((f) => f.id));
  state.value.reviewed = state.value.reviewed.filter((id) => live.has(id));
  stale.value = false;
  notice.value = "";
}
function toggleReviewed(id) {
  const next = new Set(state.value.reviewed);
  next.has(id) ? next.delete(id) : next.add(id);
  state.value.reviewed = [...next];
}
function toggleSources(id) {
  const next = new Set(expanded.value);
  next.has(id) ? next.delete(id) : next.add(id);
  expanded.value = next;
}
function guessKind(name) {
  const lower = name.toLowerCase();
  if (lower.includes("consent")) return "consent";
  if (lower.includes("protocol")) return "protocol";
  if (lower.includes("onboard") || lower.includes("delegation")) return "onboarding";
  if (lower.includes("training") || lower.includes("certificate")) return "training";
  return "other";
}
// The first real document replaces the sample packet (with undo).
function replaceSampleIfNeeded() {
  if (!state.value.sample) return;
  undoSnapshot.value = JSON.parse(JSON.stringify(state.value));
  state.value = { documents: [], reviewed: [], sample: false };
}
function addDocument({ name, text }) {
  if (state.value.documents.length >= MAX_DOCS) return (notice.value = `a packet holds up to ${MAX_DOCS} documents.`);
  if (text.length > MAX_DOC_CHARS) return (notice.value = `${name} is over ${MAX_DOC_CHARS.toLocaleString()} characters.`);
  if (totalChars.value + text.length > MAX_PACKET_CHARS) return (notice.value = "the packet is over 500,000 characters.");
  replaceSampleIfNeeded();
  const doc = { id: crypto.randomUUID(), name, kind: guessKind(name), version: inferDocumentVersion(text), text };
  state.value.documents.push(doc);
  selectedId.value = doc.id;
  markChanged();
}
async function onFiles(event) {
  for (const file of event.target.files ?? []) {
    if (!/\.(txt|md|markdown)$/i.test(file.name)) {
      notice.value = `${file.name}: only .txt and .md files are supported (no PDF/Word parsing).`;
      continue;
    }
    addDocument({ name: file.name, text: await file.text() });
  }
  event.target.value = "";
}
function newBlank() {
  addDocument({ name: `pasted document ${state.value.documents.length + 1}.md`, text: "" });
}
function removeDocument(id) {
  state.value.documents = state.value.documents.filter((doc) => doc.id !== id);
  if (selectedId.value === id) selectedId.value = state.value.documents[0]?.id ?? null;
  markChanged();
}
function undo() {
  if (!undoSnapshot.value) return;
  state.value = undoSnapshot.value;
  undoSnapshot.value = null;
  selectedId.value = state.value.documents[0]?.id ?? null;
  runChecks();
}
function loadSample() {
  state.value = { documents: createSamplePacket(), reviewed: [], sample: true };
  selectedId.value = state.value.documents[0].id;
  runChecks();
}

// ---------- export ----------
function reportData() {
  return {
    tool: "document-preflight",
    scope: CHECK_SCOPE,
    checksRun: result.value.checksRun,
    stale: stale.value,
    documents: state.value.documents.map(({ name, kind, version, text }) => ({ name, kind, version, characters: text.length })),
    findings: result.value.findings.map((f) => ({ ...f, reviewed: reviewed.value.has(f.id) })),
  };
}
async function exportJson() {
  const artifact = await createArtifact("preflight-report", reportData());
  downloadText(`microfish-preflight-${stamp()}.json`, "application/json", JSON.stringify(artifact, null, 2));
}
function exportCsv() {
  const header = ["severity", "category", "title", "summary", "recommendation", "reviewed", "source_document", "source_line", "source_quote"];
  const rows = [header.join(",")];
  for (const f of result.value.findings) {
    const sources = f.sources.length ? f.sources : [null];
    for (const src of sources) {
      rows.push([f.severity, f.category, f.title, f.summary, f.recommendation, reviewed.value.has(f.id), src?.documentName, src?.line, src?.quote].map(csvCell).join(","));
    }
  }
  downloadText(`microfish-preflight-${stamp()}.csv`, "text/csv;charset=utf-8", rows.join("\n"));
}
function exportMarkdown() {
  const lines = [`# Document preflight review`, ``, `_${new Date().toLocaleString()} · ${result.value.findings.length} findings · ${open.value} open_`, ``, `> ${CHECK_SCOPE}`, ``];
  for (const f of result.value.findings) {
    lines.push(`## [${f.severity}] ${f.title}${reviewed.value.has(f.id) ? " ✓ reviewed" : ""}`, ``, f.summary, ``, `**Recommendation:** ${f.recommendation}`, ``);
    for (const src of f.sources) lines.push(`- ${src.documentName}, line ${src.line}: \`${src.quote.trim()}\``);
    lines.push(``);
  }
  downloadText(`microfish-preflight-${stamp()}.md`, "text/markdown;charset=utf-8", lines.join("\n"));
}

const heading = ref(null);
defineExpose({ focusHeading: () => heading.value?.focus() });
</script>

<template>
  <div class="tool-page">
    <header class="tool-head">
      <div>
        <p class="mono eyebrow">protocol management · local checks</p>
        <h1 ref="heading" tabindex="-1">document preflight</h1>
        <p class="lede">catch conflicting study ids, mismatched visit counts, outdated versions and open questions across your packet — before it goes to the ethics board or a site.</p>
      </div>
      <div class="head-actions">
        <StatusBadge
          variant="chip"
          :status="stale ? 'draft' : high ? 'error' : result.findings.length ? 'running' : 'completed'"
          :label="stale ? 'packet changed' : `${result.findings.length} findings`"
          :meta="stale ? 'rerun checks' : [`${high} high`, `${open} open`]"
        />
      </div>
    </header>

    <div class="tool-grid">
      <!-- documents -->
      <section class="panel" aria-label="Documents">
        <div class="panel-head">
          <span class="mono">packet · {{ state.documents.length }}/{{ MAX_DOCS }}</span>
          <span class="panel-actions">
            <button class="mini-btn mono" @click="fileInput.click()"><FileUp :size="12" /> add files</button>
            <button class="mini-btn mono" @click="newBlank"><Plus :size="12" /> paste</button>
            <button v-if="undoSnapshot" class="mini-btn mono" @click="undo"><Undo2 :size="12" /> undo</button>
          </span>
          <input ref="fileInput" type="file" accept=".txt,.md,.markdown,text/plain,text/markdown" multiple hidden @change="onFiles" />
        </div>
        <p v-if="state.sample" class="hint mono">fictional rest-101 sample packet · add your own files to replace it</p>
        <ul class="doc-list">
          <li v-for="doc in state.documents" :key="doc.id" :class="{ active: doc.id === selectedId }">
            <button class="doc-btn" @click="selectedId = doc.id">
              <span class="doc-name">{{ doc.name }}</span>
              <span class="mono doc-meta">{{ KINDS.find((k) => k.id === doc.kind)?.label ?? doc.kind }}{{ doc.version ? ` · v${doc.version}` : "" }}</span>
            </button>
            <button class="icon-btn" :aria-label="`Remove ${doc.name}`" @click="removeDocument(doc.id)"><Trash2 :size="13" /></button>
          </li>
        </ul>
        <div v-if="selected" class="editor">
          <div class="editor-fields">
            <input v-model="selected.name" class="field" aria-label="Document name" @input="markChanged" />
            <select v-model="selected.kind" class="field mono" aria-label="Document type" @change="markChanged">
              <option v-for="kind in KINDS" :key="kind.id" :value="kind.id">{{ kind.label }}</option>
            </select>
            <input v-model="selected.version" class="field mono" placeholder="version" aria-label="Version" @input="markChanged" />
          </div>
          <textarea v-model="selected.text" class="field doc-text mono" spellcheck="false" aria-label="Document text" @input="markChanged"></textarea>
        </div>
        <div class="panel-foot">
          <button class="primary-btn mono" :disabled="!state.documents.length" @click="runChecks">run checks</button>
          <button v-if="!state.sample" class="link-btn mono" @click="loadSample">load sample packet</button>
        </div>
        <p v-if="notice" class="notice-line">{{ notice }}</p>
      </section>

      <!-- findings -->
      <section class="panel" aria-label="Findings">
        <div class="panel-head">
          <div class="segmented mono filters" role="group" aria-label="Filter findings">
            <button :class="{ active: filter === 'all' }" @click="filter = 'all'">all {{ result.findings.length }}</button>
            <button v-for="cat in PREFLIGHT_CATEGORIES" :key="cat.id" :class="{ active: filter === cat.id }" :title="cat.description" @click="filter = cat.id">
              {{ cat.label.toLowerCase() }} {{ counts[cat.id] }}
            </button>
          </div>
          <span class="panel-actions">
            <button class="mini-btn mono" @click="exportMarkdown"><Download :size="12" /> md</button>
            <button class="mini-btn mono" @click="exportCsv"><Download :size="12" /> csv</button>
            <button class="mini-btn mono" @click="exportJson"><Download :size="12" /> json</button>
          </span>
        </div>
        <p v-if="stale" class="hint mono">documents changed since the last check — results below are from the previous run.</p>
        <p v-if="!findings.length" class="empty mono">{{ result.findings.length ? "nothing in this category" : "no findings — note this doesn't prove the packet is complete" }}</p>
        <TransitionGroup name="list" tag="ul" class="finding-list">
          <li v-for="f in findings" :key="f.id" class="finding" :class="[`sev-${f.severity}`, { done: reviewed.has(f.id) }]">
            <div class="finding-head">
              <StatusBadge size="sm" :status="f.severity === 'high' ? 'error' : f.severity === 'medium' ? 'running' : 'draft'" :label="f.severity" :meta="f.category" />
              <label class="review-toggle mono">
                <input type="checkbox" :checked="reviewed.has(f.id)" @change="toggleReviewed(f.id)" /> reviewed
              </label>
            </div>
            <p class="finding-title">{{ f.title }}</p>
            <p class="finding-summary">{{ f.summary }}</p>
            <p class="finding-rec"><span class="mono">fix —</span> {{ f.recommendation }}</p>
            <button v-if="f.sources.length" class="link-btn mono" :aria-expanded="expanded.has(f.id)" @click="toggleSources(f.id)">
              {{ expanded.has(f.id) ? "hide" : "show" }} {{ f.sources.length }} source{{ f.sources.length === 1 ? "" : "s" }}
            </button>
            <ul v-if="expanded.has(f.id)" class="sources">
              <li v-for="(src, index) in f.sources" :key="index">
                <button class="source-btn" @click="selectedId = src.documentId">
                  <span class="mono">{{ src.documentName }} · line {{ src.line }}</span>
                  <code>{{ src.quote.trim() }}</code>
                </button>
              </li>
            </ul>
          </li>
        </TransitionGroup>
        <p class="scope mono">{{ CHECK_SCOPE.toLowerCase() }}</p>
      </section>
    </div>
  </div>
</template>

<style scoped>
.tool-grid {
  grid-template-columns: minmax(0, 5fr) minmax(0, 7fr);
}
.doc-list,
.finding-list,
.sources {
  margin: 0;
  padding: 0;
  list-style: none;
}
.doc-list li {
  display: flex;
  align-items: center;
  border-radius: 8px;
}
.doc-list li.active,
.doc-list li:hover {
  background: var(--surface-hover);
}
.doc-btn {
  display: grid;
  flex: 1;
  min-width: 0;
  padding: 7px 8px;
  border: 0;
  background: none;
  text-align: left;
}
.doc-name {
  overflow: hidden;
  color: var(--ink);
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.doc-meta {
  color: var(--faint);
}
.editor {
  display: grid;
  gap: 6px;
}
.editor-fields {
  display: grid;
  grid-template-columns: 1fr 140px 80px;
  gap: 6px;
}
.doc-text {
  height: 260px;
  padding: 8px;
  resize: vertical;
  line-height: 1.55;
}
.notice-line {
  margin: 0;
  color: var(--amber);
  font-size: 12.5px;
}
.filters {
  flex-wrap: wrap;
}
.empty {
  margin: 8px 0;
  color: var(--faint);
}
.finding {
  display: grid;
  gap: 4px;
  padding: 12px 0;
  border-top: 1px solid var(--hairline);
  transition: opacity 200ms var(--ease);
}
.finding.done {
  opacity: 0.55;
}
.finding-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.review-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--faint);
}
.review-toggle input {
  accent-color: var(--accent);
}
.finding-title {
  margin: 4px 0 0;
  color: var(--ink);
  font-weight: 500;
}
.finding-summary,
.finding-rec {
  margin: 0;
  color: var(--body);
  font-size: 13px;
  line-height: 1.5;
}
.finding-rec .mono {
  color: var(--faint);
}
.sources {
  display: grid;
  gap: 4px;
  margin-top: 4px;
}
.source-btn {
  display: grid;
  gap: 2px;
  width: 100%;
  padding: 6px 8px;
  border: 1px solid var(--hairline);
  border-radius: 6px;
  background: var(--canvas);
  text-align: left;
}
.source-btn .mono {
  color: var(--faint);
}
.source-btn code {
  overflow-wrap: anywhere;
  color: var(--ink);
  font-family: var(--font-mono-stack);
  font-size: 12px;
}
@media (max-width: 900px) {
  .tool-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
