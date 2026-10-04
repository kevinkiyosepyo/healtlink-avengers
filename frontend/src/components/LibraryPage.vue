<script setup>
// Source library (RAG): the team's own documents, chunked and embedded in the
// browser. Matching passages join every evidence deliberation as citable sources.
import { ref } from "vue";
import { FileUp, Search, Trash2 } from "@lucide/vue";
import StatusBadge from "./StatusBadge.vue";
import { useLibrary } from "../composables/useLibrary.js";

const library = useLibrary();
const fileInput = ref(null);
const pasteName = ref("");
const pasteText = ref("");
const query = ref("");
const results = ref(null);
const searching = ref(false);
const dragging = ref(false);

async function onFiles(list) {
  await library.addFiles([...(list ?? [])]);
}
function onDrop(event) {
  dragging.value = false;
  onFiles(event.dataTransfer?.files);
}
async function addPaste() {
  if (!pasteText.value.trim()) return;
  await library.addPasted(pasteName.value, pasteText.value);
  if (!library.error.value) {
    pasteName.value = "";
    pasteText.value = "";
  }
}
async function runSearch() {
  if (!query.value.trim()) return;
  searching.value = true;
  try {
    results.value = await library.search(query.value);
  } finally {
    searching.value = false;
  }
}
const added = (iso) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" }).toLowerCase();

const heading = ref(null);
defineExpose({ focusHeading: () => heading.value?.focus() });
</script>

<template>
  <div class="tool-page">
    <header class="tool-head">
      <div>
        <p class="mono eyebrow">evidence · bring your own sources</p>
        <h1 ref="heading" tabindex="-1">source library</h1>
        <p class="lede">add your protocols, site reports, survey summaries or policy pdfs. the agents search them alongside the literature and cite the exact passage, page and line.</p>
      </div>
      <label class="check mono">
        <input type="checkbox" :checked="library.enabled.value" @change="library.setEnabled($event.target.checked)" />
        use in deliberations
      </label>
    </header>

    <div class="metrics">
      <div class="metric"><span class="mono">documents</span><strong>{{ library.count.value }}</strong></div>
      <div class="metric"><span class="mono">indexed passages</span><strong>{{ library.chunkCount.value }}</strong></div>
      <div class="metric">
        <span class="mono">where it lives</span>
        <strong class="small">this browser only</strong>
        <span class="mono faint">only matched excerpts are sent to openai during a deliberation</span>
      </div>
    </div>

    <div class="tool-grid">
      <section class="panel" aria-label="Add documents">
        <div class="panel-head"><span class="mono">add documents</span></div>
        <button
          class="dropzone"
          :class="{ over: dragging }"
          type="button"
          @click="fileInput.click()"
          @dragover.prevent="dragging = true"
          @dragleave="dragging = false"
          @drop.prevent="onDrop"
        >
          <FileUp :size="18" />
          <span>drop files or click to choose</span>
          <span class="mono faint">pdf · txt · md · csv · json · up to 25 mb</span>
        </button>
        <input ref="fileInput" type="file" multiple hidden accept=".pdf,.txt,.md,.markdown,.csv,.tsv,.json,application/pdf,text/*" @change="onFiles($event.target.files); $event.target.value = ''" />

        <div v-if="library.busy.value" class="busy">
          <StatusBadge status="running" :label="`indexing ${library.busy.value.name}`" :meta="library.busy.value.total ? `${library.busy.value.done}/${library.busy.value.total} passages` : 'reading'" />
          <div v-if="library.busy.value.total" class="progress"><div :style="{ width: `${(library.busy.value.done / library.busy.value.total) * 100}%` }"></div></div>
        </div>
        <p v-if="library.error.value" class="error-line">{{ library.error.value }}</p>

        <p class="mono label">or paste text</p>
        <input v-model="pasteName" class="field" placeholder="name (e.g. site 3 retention notes)" aria-label="Document name" />
        <textarea v-model="pasteText" class="field paste mono" placeholder="paste notes, an email thread summary, a protocol section…" aria-label="Document text"></textarea>
        <div class="panel-foot">
          <button class="primary-btn" type="button" :disabled="!pasteText.trim() || Boolean(library.busy.value)" @click="addPaste">add to library</button>
        </div>
        <p class="hint">embedding runs locally (minilm). scanned pdfs need ocr first. word files: save as pdf.</p>
      </section>

      <section class="panel" aria-label="Documents">
        <div class="panel-head">
          <span class="mono">documents</span>
        </div>
        <p v-if="!library.documents.value.length" class="hint">no documents yet. deliberations use the literature and web only until you add some.</p>
        <ul class="docs">
          <li v-for="doc in library.documents.value" :key="doc.id">
            <span class="doc-text">
              <span class="doc-name">{{ doc.name }}</span>
              <span class="mono faint">{{ doc.type }}{{ doc.pages ? ` · ${doc.pages} pages` : "" }} · {{ doc.chunks }} passages · added {{ added(doc.addedAt) }}{{ doc.truncated ? " · truncated" : "" }}</span>
            </span>
            <button class="icon-btn" :aria-label="`Remove ${doc.name}`" @click="library.remove(doc.id)"><Trash2 :size="13" /></button>
          </li>
        </ul>

        <div class="search">
          <p class="mono label">test retrieval</p>
          <div class="search-row">
            <input v-model="query" class="field" placeholder="what would the agents find for…" aria-label="Test query" @keydown.enter="runSearch" />
            <button class="mini-btn" type="button" :disabled="!query.trim() || searching || !library.count.value" @click="runSearch"><Search :size="12" /> search</button>
          </div>
          <p v-if="results && !results.length" class="hint">no passage is similar enough. try different wording.</p>
          <ul v-if="results?.length" class="hits">
            <li v-for="hit in results" :key="`${hit.docId}-${hit.chunkIndex}`">
              <span class="code-text faint">{{ hit.docName }}{{ hit.page ? ` · p. ${hit.page}` : "" }} · line {{ hit.line }} · similarity {{ hit.score }}</span>
              <p>{{ hit.text }}</p>
            </li>
          </ul>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.tool-grid {
  grid-template-columns: minmax(0, 5fr) minmax(0, 7fr);
}
.metric strong.small {
  font-size: 16px;
}
.check {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--muted);
}
.check input {
  accent-color: var(--accent);
}
.dropzone {
  display: grid;
  place-items: center;
  gap: 4px;
  padding: 22px 12px;
  border: 1px dashed var(--hairline);
  border-radius: 10px;
  background: var(--canvas);
  color: var(--body);
  transition: border-color 120ms var(--ease), background 120ms var(--ease);
}
.dropzone:hover,
.dropzone.over {
  border-color: color-mix(in srgb, var(--accent) 55%, var(--hairline));
  background: color-mix(in srgb, var(--accent) 5%, var(--canvas));
}
.busy {
  display: grid;
  gap: 6px;
}
.progress {
  height: 2px;
  overflow: hidden;
  border-radius: 2px;
  background: var(--hairline);
}
.progress > div {
  height: 100%;
  background: var(--accent);
  transition: width 200ms linear;
}
.error-line {
  margin: 0;
  color: var(--danger);
  font-size: 12.5px;
}
.label {
  margin: 6px 0 0;
  color: var(--faint);
}
.paste {
  height: 120px;
  padding: 8px;
  resize: vertical;
}
.docs,
.hits {
  display: grid;
  gap: 2px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.docs li {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 8px;
}
.docs li:hover {
  background: var(--surface-hover);
}
.doc-text {
  display: grid;
  flex: 1;
  min-width: 0;
}
.doc-name {
  overflow: hidden;
  color: var(--ink);
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.search {
  display: grid;
  gap: 6px;
  padding-top: 10px;
  border-top: 1px solid var(--hairline);
}
.search-row {
  display: flex;
  gap: 6px;
}
.search-row .field {
  flex: 1;
}
.hits li {
  padding: 8px 10px;
  border: 1px solid var(--hairline);
  border-radius: 8px;
  background: var(--canvas);
}
.hits p {
  margin: 4px 0 0;
  color: var(--body);
  font-size: 12.5px;
  line-height: 1.5;
}
@media (max-width: 900px) {
  .tool-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
