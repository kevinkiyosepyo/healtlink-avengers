<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'
import StatusIcon from './StatusIcon.vue'
import { importSimulationFile, SIMULATION_IMPORT_ACCEPT } from '../lib/simulationImports.js'
import { downloadText, stamp } from '../lib/download.js'
import { useResearchTools } from '../composables/useResearchTools.js'
import {
  addLibraryDocuments, EVIDENCE_HISTORY_LIMIT, normalizeEvidenceResult, RESEARCH_LIBRARY_LIMIT,
  researchExportMarkdown, searchLibraryDocuments, simulationReviewExport,
} from '../lib/researchTools.js'

const props = defineProps({
  sessions: { type: Array, default: () => [] },
  activeSession: { type: Object, default: null },
  storageKey: { type: String, required: true },
  workspaceKind: { type: String, default: 'demo' },
  providerConnected: Boolean, openaiConnected: Boolean, anthropicConnected: Boolean,
  notice: { type: String, default: '' },
})
const emit = defineEmits(['select-session', 'review-setup', 'navigate', 'attach-documents'])
const { data, warning, save } = useResearchTools(() => props.storageKey)
const requestedTab = new URLSearchParams(window.location.hash.split('?')[1] || '').get('tab')
const tab = ref(['sources', 'evidence', 'history'].includes(requestedTab) ? requestedTab : 'sources')
function syncRequestedTab() {
  if (!window.location.hash.startsWith('#/research')) return
  const requested = new URLSearchParams(window.location.hash.split('?')[1] || '').get('tab')
  if (['sources', 'evidence', 'history'].includes(requested)) tab.value = requested
}
window.addEventListener('hashchange', syncRequestedTab)
const heading = ref(null)
defineExpose({ focusHeading: () => heading.value?.focus() })
const search = ref('')
const query = ref('')
const selectedDocuments = ref([])
const selectedDocument = ref(null)
const selectedSource = ref(null)
const provider = ref('openai')
const notice = ref('')
const error = ref('')
const importing = ref(false)
const exportingLegacy = ref(false)
const legacyNotice = ref('')
const reviewing = ref(false)
const currentReview = ref(null)
const historyFilter = ref('all')
const fileInput = ref(null)
const sourceDetail = ref(null)
let controller = null
let requestProvider = null
let generation = 0
let importGeneration = 0
let archiveGeneration = 0

const tabs = [{ id: 'sources', name: 'Sources', icon: 'document' }, { id: 'evidence', name: 'Evidence', icon: 'layers' }, { id: 'history', name: 'Review history', icon: 'clock' }]
const connectedProviders = computed(() => [
  ...(props.openaiConnected || (props.providerConnected && !props.anthropicConnected) ? ['openai'] : []),
  ...(props.anthropicConnected ? ['anthropic'] : []),
])
const selectedProviderReady = computed(() => props.workspaceKind !== 'demo' && connectedProviders.value.includes(provider.value))
const documents = computed(() => data.value.documents)
const searchResults = computed(() => searchLibraryDocuments(documents.value, search.value, 12))
const matchedPassages = computed(() => searchLibraryDocuments(documents.value, query.value))
const documentDetail = computed(() => documents.value.find(document => document.id === selectedDocument.value))
const source = computed(() => currentReview.value?.sources.find(item => item.id === selectedSource.value))
const attachedIds = computed(() => new Set((props.activeSession?.context?.documents || []).map(document => document.id)))
const running = computed(() => props.activeSession?.runs.some(run => run.status === 'running'))
const runHistory = computed(() => props.sessions.flatMap(session => session.runs.map(run => ({ session, run })))
  .filter(({ session }) => historyFilter.value === 'all' || session.id === props.activeSession?.id)
  .sort((a, b) => b.run.startedAt - a.run.startedAt))
const evidenceHistory = computed(() => data.value.reviews.filter(review => historyFilter.value === 'all' || review.sessionId === props.activeSession?.id))
const activeTitle = computed(() => props.activeSession?.title || 'No simulation selected')
const sourceDomain = url => { try { return new URL(url).hostname } catch { return 'Scholarly source' } }
const lineLabel = (item) => `Extracted text lines ${item.lineStart}–${item.lineEnd || item.lineStart}`
const dateLabel = value => new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
const providerLabel = value => value === 'anthropic' ? 'Anthropic' : value === 'openai' ? 'OpenAI' : 'Scripted demo'

watch(connectedProviders, choices => {
  if (reviewing.value && !choices.includes(requestProvider)) cancelReview()
  if (!choices.includes(provider.value)) provider.value = choices[0] || 'openai'
}, { immediate: true })

function cancelReview() {
  generation += 1
  controller?.abort()
  controller = null
  requestProvider = null
  reviewing.value = false
}
watch(() => [props.storageKey, props.activeSession?.id, props.workspaceKind], () => {
  cancelReview()
  currentReview.value = null
  selectedSource.value = null
  query.value = ''
  notice.value = ''
  error.value = ''
}, { flush: 'sync' })
watch(() => props.storageKey, () => {
  importGeneration += 1
  archiveGeneration += 1
  exportingLegacy.value = false
  legacyNotice.value = ''
  importing.value = false
  selectedDocuments.value = []
  selectedDocument.value = null
  search.value = ''
}, { flush: 'sync' })
onBeforeUnmount(() => {
  importGeneration += 1
  archiveGeneration += 1
  cancelReview()
  window.removeEventListener('hashchange', syncRequestedTab)
})

async function importFiles(event) {
  const files = [...(event.target.files || [])]
  event.target.value = ''
  if (!files.length) return
  const request = ++importGeneration
  importing.value = true
  error.value = ''
  notice.value = ''
  try {
    const imported = []
    for (const file of files) {
      imported.push(...await importSimulationFile(file))
      if (request !== importGeneration) return
      if (imported.length > RESEARCH_LIBRARY_LIMIT) throw new Error(`Import up to ${RESEARCH_LIBRARY_LIMIT} documents at a time.`)
    }
    const next = addLibraryDocuments(documents.value, imported)
    const added = next.length - documents.value.length
    if (save({ ...data.value, documents: next })) notice.value = added ? `${added} source${added === 1 ? '' : 's'} added to this workspace.` : 'These sources are already in your library.'
  } catch (cause) {
    if (request === importGeneration) error.value = cause.message || 'The documents could not be imported.'
  } finally { if (request === importGeneration) importing.value = false }
}
function removeDocument(document) {
  if (!save({ ...data.value, documents: documents.value.filter(item => item.id !== document.id) })) return
  selectedDocuments.value = selectedDocuments.value.filter(id => id !== document.id)
  if (selectedDocument.value === document.id) selectedDocument.value = null
  notice.value = `${document.name} removed from the library. Existing simulation copies and review citations are preserved.`
}
function attachDocuments() {
  const selected = documents.value.filter(document => selectedDocuments.value.includes(document.id))
  if (!selected.length || !props.activeSession || running.value) return
  notice.value = ''
  emit('attach-documents', selected.map(document => ({ ...document })))
}
async function inspectSource(id) {
  selectedSource.value = id
  await nextTick()
  sourceDetail.value?.focus()
}
function showReview(review) {
  cancelReview()
  currentReview.value = review
  query.value = review.query
  selectedSource.value = null
  tab.value = 'evidence'
}
async function requestEvidence() {
  if (reviewing.value || !query.value.trim() || !selectedProviderReady.value || !props.activeSession) return
  const session = props.activeSession
  const request = ++generation
  const selectedProvider = provider.value
  requestProvider = selectedProvider
  const question = query.value.trim()
  const context = session.context ? JSON.parse(JSON.stringify(session.context)) : null
  const passages = matchedPassages.value.map(({ id, documentId, name, text, lineStart, lineEnd }) => ({ id, documentId, name, text, lineStart, lineEnd }))
  controller = new AbortController()
  reviewing.value = true
  error.value = ''
  notice.value = ''
  currentReview.value = null
  selectedSource.value = null
  try {
    const response = await fetch('/api/evidence', {
      method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
      body: JSON.stringify({ query: question, context, provider: selectedProvider, passages }),
    })
    const result = await response.json().catch(() => ({}))
    if (request !== generation) return
    if (!response.ok) throw new Error(result.error || 'The evidence review could not complete. Try again.')
    const reviewed = normalizeEvidenceResult(result)
    const record = {
      ...reviewed, id: crypto.randomUUID(), sessionId: session.id, sessionTitle: session.title, query: question, createdAt: Date.now(),
      contextDescription: `Reviewed with ${context?.documents?.length || 0} study documents and ${passages.length} matched library passages${context?.university?.name ? `; university: ${context.university.name}` : ''}.`,
    }
    currentReview.value = record
    if (save({ ...data.value, reviews: [record, ...data.value.reviews].slice(0, EVIDENCE_HISTORY_LIMIT) })) notice.value = 'Evidence review saved to this workspace’s history.'
  } catch (cause) {
    if (request === generation && cause.name !== 'AbortError') error.value = cause.message || 'The evidence review could not complete.'
  } finally {
    if (request === generation) { reviewing.value = false; controller = null }
  }
}
function exportReview(record, format) {
  const content = format === 'json' ? JSON.stringify(record, null, 2) : researchExportMarkdown(record)
  downloadText(`lookahead-review-${stamp()}.${format === 'json' ? 'json' : 'md'}`, format === 'json' ? 'application/json' : 'text/markdown', content)
}
function exportRun(session, run, format) {
  exportReview(simulationReviewExport(session, run, data.value.reviews), format)
}
async function exportEarlierWorkspace() {
  if (exportingLegacy.value) return
  const request = ++archiveGeneration
  exportingLegacy.value = true
  legacyNotice.value = ''
  try {
    const { exportLegacyResearch } = await import('../lib/legacyResearchExport.js')
    const result = await exportLegacyResearch()
    if (request !== archiveGeneration) return
    if (result.status === 'empty') {
      legacyNotice.value = 'No earlier workspace data was found in this browser.'
      return
    }
    downloadText(`lookahead-earlier-workspace-${stamp()}.json`, 'application/json', JSON.stringify(result.archive, null, 2))
    legacyNotice.value = [`Exported ${result.documentCount} documents and ${result.recordCount} records from the earlier browser workspace.`, ...result.warnings].join(' ')
  } catch (cause) {
    if (request === archiveGeneration) legacyNotice.value = cause.message || 'The earlier workspace could not be exported.'
  } finally { if (request === archiveGeneration) exportingLegacy.value = false }
}
function deleteEvidence(review) {
  if (save({ ...data.value, reviews: data.value.reviews.filter(item => item.id !== review.id) }) && currentReview.value?.id === review.id) currentReview.value = null
}
</script>

<template>
  <section class="research-tools" aria-labelledby="research-tools-title">
    <header class="research-heading">
      <div>
        <p class="research-eyebrow">Workspace</p>
        <h1 ref="heading" tabindex="-1" id="research-tools-title">Research tools</h1>
        <p>Keep the sources, evidence, and review history behind your simulations together.</p>
      </div>
      <span class="research-scope">{{ workspaceKind === 'demo' ? 'Demo workspace · saved on this browser' : 'Your workspace · saved on this browser' }}</span>
    </header>
    <nav class="research-tabs" aria-label="Research tools sections">
      <button v-for="item in tabs" :key="item.id" type="button" :aria-pressed="tab === item.id" @click="tab = item.id">
        <AppIcon :name="item.icon" :size="18" />{{ item.name }}
        <span v-if="item.id === 'sources'">{{ documents.length }}</span>
      </button>
    </nav>
    <p v-if="props.notice" class="research-notice" role="status">{{ props.notice }}</p>
    <p v-if="warning" class="research-notice warning" role="alert">{{ warning }}</p>
    <p v-if="error" class="research-notice warning" role="alert">{{ error }}</p>
    <p v-if="notice" class="research-notice" role="status">{{ notice }}</p>

    <section v-if="tab === 'sources'" aria-label="Source library" class="research-section">
      <div class="section-heading">
        <div><h2>Source library</h2><p>Find passages in your PDFs, Markdown, and text files. Files stay in this browser until you use them in an AI review.</p></div>
        <button class="research-button primary" :disabled="importing" @click="fileInput?.click()"><AppIcon name="plus" :size="17" />{{ importing ? 'Importing…' : 'Import sources' }}</button>
        <input ref="fileInput" class="visually-hidden" type="file" :accept="SIMULATION_IMPORT_ACCEPT" multiple aria-label="Import research sources" @change="importFiles" />
      </div>
      <label class="research-search"><AppIcon name="search" :size="19" /><input v-model="search" type="search" placeholder="Search document text or filenames" aria-label="Search source library" /></label>
      <p class="research-caption">PDF, Markdown, TXT, or ZIP · Up to 12 sources and 120,000 extracted characters. Search by keyword or document name.</p>
      <div v-if="!documents.length" class="research-empty">
        <AppIcon name="document" :size="30" /><h3>Start with the source material</h3>
        <p>Import a protocol, consent form, or research notes, then search for the details your reviewers need.</p>
        <button class="research-button" :disabled="importing" @click="fileInput?.click()">Choose files</button>
      </div>
      <template v-else>
        <div class="source-actions"><span>{{ selectedDocuments.length }} selected</span><button class="research-button" :disabled="!selectedDocuments.length || !activeSession || running" @click="attachDocuments">Add to current simulation</button></div>
        <p v-if="running" class="research-caption">Stop the current simulation before changing its source documents.</p>
        <p v-if="selectedDocuments.length" class="research-caption">Current simulation: {{ activeTitle }}</p>
        <div class="source-layout">
          <div class="source-list">
            <article v-for="document in documents" :key="document.id" class="source-row" :class="{ selected: selectedDocument === document.id }">
              <input v-model="selectedDocuments" type="checkbox" :value="document.id" :aria-label="`Select ${document.name}`" />
              <button class="source-open" @click="selectedDocument = document.id"><strong>{{ document.name }}</strong><span>{{ document.kind.toUpperCase() }} · {{ document.text.length.toLocaleString() }} characters<span v-if="attachedIds.has(document.id)"> · In current simulation</span></span></button>
              <button class="research-icon-button" :aria-label="`Remove ${document.name} from library`" @click="removeDocument(document)"><AppIcon name="trash" :size="17" /></button>
            </article>
          </div>
          <div class="source-preview">
            <template v-if="search.trim()">
              <h3>{{ searchResults.length }} matching passages</h3>
              <p v-if="!searchResults.length" class="research-caption">No keyword matches. Try a study term or document name.</p>
              <article v-for="passage in searchResults" :key="passage.id" class="passage">
                <button class="research-text-button" @click="selectedDocument = passage.documentId; search = ''">{{ passage.name }}</button>
                <p class="research-caption">{{ lineLabel(passage) }}{{ passage.kind === 'pdf' ? ' · Not original PDF page numbers' : '' }}</p>
                <blockquote>{{ passage.text }}</blockquote>
              </article>
            </template>
            <template v-else-if="documentDetail"><h3>{{ documentDetail.name }}</h3><p class="research-caption">Extracted document text · not independently verified</p><pre class="document-text">{{ documentDetail.text }}</pre></template>
            <div v-else class="research-empty compact"><AppIcon name="search" :size="25" /><p>Search for a passage or select a source to read its extracted text.</p></div>
          </div>
        </div>
      </template>
    </section>

    <section v-else-if="tab === 'evidence'" aria-label="Evidence review" class="research-section">
      <div class="section-heading"><div><h2>Review the evidence</h2><p>Ask a focused question using the current simulation’s setup, matching library passages, and scholarly sources.</p></div></div>
      <div class="active-study"><AppIcon name="chat" :size="20" /><div><span>Current simulation</span><strong>{{ activeTitle }}</strong></div><button v-if="activeSession" class="research-text-button" @click="emit('review-setup', activeSession.id)">Review setup</button></div>
      <form class="evidence-form" @submit.prevent="requestEvidence">
        <label for="evidence-question">Evidence question</label>
        <textarea id="evidence-question" v-model="query" rows="4" maxlength="2000" placeholder="What evidence supports this study’s consent process, and where are the gaps?" :disabled="reviewing" />
        <div class="evidence-controls"><span class="research-caption">{{ matchedPassages.length }} matching library passages · {{ query.length }}/2,000</span><div>
          <label class="provider-picker">Provider<select v-model="provider" :disabled="reviewing || !connectedProviders.length"><option value="openai" :disabled="!connectedProviders.includes('openai')">OpenAI</option><option value="anthropic" :disabled="!connectedProviders.includes('anthropic')">Anthropic</option></select></label>
          <button v-if="reviewing" type="button" class="research-button" @click="cancelReview(); notice = 'Stopped waiting for the evidence review.'"><AppIcon name="stop" :size="16" />Stop</button>
          <button v-else type="submit" class="research-button primary" :disabled="!query.trim() || !selectedProviderReady || !activeSession"><AppIcon name="layers" :size="17" />Review evidence</button>
        </div></div>
      </form>
      <p v-if="!selectedProviderReady" class="research-notice">{{ workspaceKind === 'demo' ? 'Demo mode supports local source search. Sign in and connect an AI provider to run a cited evidence review.' : 'Connect an AI provider in account settings to run a cited evidence review.' }} <button v-if="workspaceKind === 'demo'" class="research-text-button" @click="emit('navigate', 'login')">Sign in</button></p>
      <p class="research-caption">Running a review sends your question, study setup, and matched passages to the selected provider. Scholarly search services receive search terms. API usage may apply.</p>
      <details v-if="matchedPassages.length && !reviewing" class="matched-passages"><summary>Preview the library passages included</summary><article v-for="passage in matchedPassages" :key="passage.id" class="passage"><strong>{{ passage.name }}</strong><p class="research-caption">{{ lineLabel(passage) }}</p><blockquote>{{ passage.text }}</blockquote></article></details>
      <div v-if="reviewing" class="research-empty compact" role="status"><StatusIcon status="running" :size="22" /><p>Retrieving sources and reviewing the evidence…</p><p class="research-caption">You can stop this request. Switching simulations also stops it.</p></div>
      <article v-if="currentReview" class="evidence-result" aria-label="Evidence review result">
        <header class="result-heading"><div><p class="research-eyebrow">AI evidence review</p><h3>{{ currentReview.query }}</h3><p class="research-caption">{{ providerLabel(currentReview.provider) }} · {{ currentReview.model }} · {{ dateLabel(currentReview.createdAt) }}</p><p v-if="currentReview.sessionId !== activeSession?.id" class="research-caption">Saved review for {{ currentReview.sessionTitle }}</p></div><div class="export-actions"><button class="research-button" @click="exportReview(currentReview, 'md')">Markdown</button><button class="research-button" @click="exportReview(currentReview, 'json')">JSON</button></div></header>
        <p v-for="item in currentReview.warnings" :key="item" class="research-notice warning">{{ item }}</p>
        <template v-if="currentReview.review?.claims.length">
          <p class="review-summary">{{ currentReview.review.summary }}</p>
          <div class="review-claims"><div v-for="(claim, index) in currentReview.review.claims" :key="index" class="review-claim"><p>{{ claim.text }}</p><div><button v-for="id in claim.sources" :key="id" class="citation-button" :aria-label="`Read source ${id}`" @click="inspectSource(id)">[{{ id }}]</button><span v-if="claim.uncited" class="uncited-label">Uncited claim</span></div></div></div>
          <div v-if="currentReview.review.disagreements.length" class="review-questions"><h4>Where evidence differs</h4><ul><li v-for="item in currentReview.review.disagreements" :key="item">{{ item }}</li></ul></div>
          <div v-if="currentReview.review.questions.length" class="review-questions"><h4>Questions to resolve</h4><ul><li v-for="item in currentReview.review.questions" :key="item">{{ item }}</li></ul></div>
        </template>
        <p v-else class="plain-review">{{ currentReview.content }}</p>
        <p class="research-caption">AI findings need researcher verification. Citations identify material supplied to the model; they do not establish study approval.</p>
        <div v-if="source" ref="sourceDetail" tabindex="-1" class="citation-detail"><div class="section-heading"><h4>[{{ source.id }}] {{ source.title }}</h4><button class="research-icon-button" aria-label="Close source excerpt" @click="selectedSource = null"><AppIcon name="close" :size="18" /></button></div><p class="research-caption">{{ source.kind === 'document' ? 'Uploaded document · not independently verified' : source.kind === 'institution-policy' ? 'Verified institution policy excerpt' : 'Retrieved scholarly source' }}<span v-if="source.lineStart"> · {{ lineLabel(source) }}</span></p><blockquote>{{ source.excerpt || 'No excerpt was returned for this source.' }}</blockquote><a v-if="source.url" :href="source.url" target="_blank" rel="noopener noreferrer">Open original source <AppIcon name="arrow-up-right" :size="15" /></a></div>
        <div class="review-sources"><h4>Sources and provenance</h4><p v-if="!currentReview.sources.length" class="research-caption">No sources were returned. Treat this review as uncited.</p><button v-for="item in currentReview.sources" :key="item.id" class="review-source" @click="inspectSource(item.id)"><span>[{{ item.id }}]</span><div><strong>{{ item.title }}</strong><small>{{ item.kind === 'document' ? 'Uploaded source' : item.kind === 'institution-policy' ? 'Institution policy' : item.url ? sourceDomain(item.url) : 'Scholarly source' }}</small></div><AppIcon name="chevron" :size="16" /></button></div>
      </article>
    </section>

    <section v-else aria-label="Review history" class="research-section">
      <div class="section-heading"><div><h2>Review history</h2><p>Revisit simulation runs and cited evidence reviews saved in this workspace.</p></div><label class="history-filter">Show<select v-model="historyFilter"><option value="all">All simulations</option><option value="current">Current simulation</option></select></label></div>
      <div v-if="!runHistory.length && !evidenceHistory.length" class="research-empty"><AppIcon name="clock" :size="30" /><h3>Your reviews will appear here</h3><p>Run a simulation or review a question in Evidence. You can return to the chat and export the results here.</p><button class="research-button" @click="tab = 'evidence'">Review evidence</button></div>
      <template v-if="runHistory.length"><h3 class="history-heading">Simulation runs <span>{{ runHistory.length }}</span></h3><article v-for="{ session, run } in runHistory" :key="run.id" class="history-row"><div class="history-body"><div class="history-metadata"><StatusIcon :status="run.status === 'failed' ? 'error' : run.status" :progress="run.progress" />{{ run.status }} · {{ providerLabel(run.mode) }} · {{ dateLabel(run.startedAt) }}</div><h4>{{ session.title }}</h4><p>{{ run.prompt }}</p><p v-if="run.model" class="research-caption">{{ run.model }}</p></div><div class="history-actions"><button class="research-text-button" @click="emit('select-session', session.id)">Open simulation <AppIcon name="arrow-up-right" :size="15" /></button><div class="export-actions"><button class="research-button" @click="exportRun(session, run, 'md')">Markdown</button><button class="research-button" @click="exportRun(session, run, 'json')">JSON</button></div></div></article></template>
      <template v-if="evidenceHistory.length"><h3 class="history-heading">Evidence reviews <span>{{ evidenceHistory.length }}</span></h3><p class="research-caption">The latest {{ EVIDENCE_HISTORY_LIMIT }} evidence reviews are kept. Export reviews you want to retain longer.</p><article v-for="review in evidenceHistory" :key="review.id" class="history-row"><div class="history-body"><div class="history-metadata"><StatusIcon status="completed" />Completed · {{ providerLabel(review.provider) }} · {{ dateLabel(review.createdAt) }}</div><h4>{{ review.query }}</h4><p>{{ review.sessionTitle }} · {{ review.sources.length }} sources</p></div><div class="history-actions"><button class="research-text-button" @click="showReview(review)">Read review <AppIcon name="arrow-right" :size="15" /></button><div class="export-actions"><button class="research-button" @click="exportReview(review, 'md')">Markdown</button><button class="research-button" @click="exportReview(review, 'json')">JSON</button><button class="research-icon-button" :aria-label="`Delete evidence review: ${review.query}`" @click="deleteEvidence(review)"><AppIcon name="trash" :size="17" /></button></div></div></article></template>
      <div class="legacy-export">
        <h3>Earlier workspace data</h3>
        <p class="research-caption">If you used the previous research site, you can export its browser-stored documents and reviews. That data is not assigned to this account and will not be imported automatically.</p>
        <button class="research-button" :disabled="exportingLegacy" @click="exportEarlierWorkspace"><AppIcon name="download" :size="16" />{{ exportingLegacy ? 'Preparing archive…' : 'Export earlier workspace data' }}</button>
        <p v-if="legacyNotice" class="research-caption" role="status">{{ legacyNotice }}</p>
      </div>
    </section>
  </section>
</template>

<style scoped>
.research-tools { max-width: 1320px; width: 100%; margin: 0 auto; padding: 40px 42px 72px; color: var(--ui-text); --faint: var(--ui-muted); --accent: var(--ui-accent); --teal: var(--ui-accent); --danger: var(--ui-danger); --canvas: var(--ui-canvas); }
.research-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; }
.research-eyebrow { margin: 0 0 12px; font: 600 11px/1.4 var(--font-data); text-transform: uppercase; letter-spacing: .12em; color: var(--ui-accent); }
h1 { font: 400 40px/1.12 var(--font-display); margin: 0 0 12px; letter-spacing: -.03em; }
h2 { margin: 0 0 8px; font-size: 21px; font-weight: 600; }
h3 { font-size: 17px; margin: 0 0 10px; }
h4 { font-size: 15px; margin: 0 0 8px; }
p { margin: 0; line-height: 1.6; }
.research-heading > div > p:last-child, .section-heading p { color: var(--ui-muted); max-width: 660px; font-size: 14px; }
.research-scope { padding: 7px 0; font: 11px/1.6 var(--font-data); color: var(--ui-muted); max-width: 190px; }
.research-tabs { display: flex; margin: 30px 0 28px; gap: 28px; border-bottom: 1px solid var(--ui-border); }
.research-tabs button { display: flex; align-items: center; gap: 9px; padding: 14px 0; border: 0; border-bottom: 2px solid transparent; margin-bottom: -1px; background: transparent; color: var(--ui-muted); font-size: 14px; font-weight: 600; cursor: pointer; white-space: nowrap; }
.research-tabs button[aria-pressed=true] { color: var(--ui-accent); border-bottom-color: var(--ui-accent); }
.research-tabs button span { font: 11px var(--font-data); padding: 3px 6px; background: var(--ui-surface-alt); border-radius: 4px; }
.research-section { min-width: 0; }
.section-heading, .result-heading { display: flex; justify-content: space-between; align-items: flex-start; gap: 22px; margin-bottom: 22px; }
.research-button { display: inline-flex; align-items: center; justify-content: center; gap: 7px; border: 1px solid var(--ui-control-border); border-radius: 6px; background: var(--ui-surface); color: var(--ui-text); padding: 9px 13px; font-size: 13px; font-weight: 550; min-height: 38px; cursor: pointer; white-space: nowrap; }
.research-button:hover:not(:disabled), .research-icon-button:hover { background: var(--ui-hover); }
.research-button.primary { background: var(--ui-accent); border-color: var(--ui-accent); color: var(--ui-on-accent); }
.research-button.primary:hover:not(:disabled) { filter: brightness(.95); }
button:disabled { opacity: .5; cursor: not-allowed; }
.research-icon-button { display: inline-flex; align-items: center; justify-content: center; width: 34px; min-width: 34px; height: 34px; border: 0; border-radius: 4px; color: var(--ui-muted); background: transparent; cursor: pointer; }
.research-text-button { display: inline-flex; align-items: center; gap: 6px; border: 0; padding: 2px 0; background: transparent; color: var(--ui-accent); font-size: 13px; text-align: left; cursor: pointer; }
.research-caption { color: var(--ui-muted); font-size: 12px; line-height: 1.6; }
.research-search { display: flex; align-items: center; gap: 10px; margin: 22px 0 9px; padding: 0 12px; border: 1px solid var(--ui-control-border); border-radius: 6px; background: var(--ui-surface); color: var(--ui-muted); }
.research-search input { width: 100%; min-width: 0; height: 44px; border: 0; background: transparent; color: var(--ui-text); font: inherit; font-size: 14px; }
.research-search:focus-within { outline: 2px solid var(--ui-focus); outline-offset: 2px; }
.research-search input:focus-visible { outline: none; }
.research-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 275px; gap: 16px; text-align: center; padding: 40px 24px; margin: 28px 0 0; border: 1px dashed var(--ui-border); border-radius: 8px; color: var(--ui-muted); }
.research-empty h3 { color: var(--ui-text); margin: 0; }
.research-empty p { max-width: 430px; font-size: 14px; }
.research-empty.compact { border: 0; margin: 0; min-height: 190px; }
.source-actions { margin: 24px 0 12px; display: flex; justify-content: space-between; align-items: center; gap: 16px; font-size: 12px; color: var(--ui-muted); }
.source-layout { display: grid; grid-template-columns: minmax(220px, .9fr) minmax(0, 1.6fr); border: 1px solid var(--ui-border); border-radius: 7px; margin-top: 10px; overflow: hidden; }
.source-list { background: var(--ui-surface-alt); border-right: 1px solid var(--ui-border); }
.source-row { display: flex; align-items: flex-start; gap: 8px; border-bottom: 1px solid var(--ui-border); padding: 15px 10px 15px 14px; }
.source-row:last-child { border-bottom: 0; }
.source-row.selected { background: var(--ui-selected); }
.source-row input { margin: 6px 0 0; accent-color: var(--ui-accent); width: 16px; height: 16px; }
.source-open { flex: 1; min-width: 0; border: 0; padding: 3px; text-align: left; background: transparent; color: var(--ui-text); cursor: pointer; }
.source-open strong { font-size: 13px; display: block; overflow-wrap: anywhere; line-height: 1.5; }
.source-open > span { display: block; color: var(--ui-muted); font-size: 10px; line-height: 1.6; margin-top: 4px; }
.source-preview { min-width: 0; padding: 24px; max-height: 650px; overflow: auto; background: var(--ui-surface); }
.document-text { white-space: pre-wrap; font: 13px/1.75 var(--font-body); overflow-wrap: anywhere; margin: 18px 0 0; }
.passage { padding: 18px 0; border-bottom: 1px solid var(--ui-border); }
.passage:last-child { border-bottom: 0; }
.passage strong { font-size: 13px; }
blockquote { margin: 10px 0 0; padding-left: 14px; border-left: 2px solid var(--ui-border); font-size: 13px; line-height: 1.75; overflow-wrap: anywhere; white-space: pre-wrap; }
.research-notice { padding: 12px 14px; margin: 0 0 18px; color: var(--ui-info); background: var(--ui-info-bg); border-radius: 5px; font-size: 13px; }
.research-notice.warning { color: var(--ui-warning); background: var(--ui-warning-bg); }
.active-study { padding: 14px 16px; display: flex; align-items: center; gap: 13px; background: var(--ui-surface-alt); border: 1px solid var(--ui-border); border-radius: 6px; margin-bottom: 22px; }
.active-study > div { display: flex; flex-direction: column; gap: 4px; min-width: 0; flex: 1; }
.active-study span { font-size: 11px; color: var(--ui-muted); }
.active-study strong { font-size: 13px; overflow-wrap: anywhere; }
.evidence-form > label { display: block; font-size: 13px; font-weight: 600; margin-bottom: 10px; }
.evidence-form textarea { width: 100%; display: block; resize: vertical; min-height: 110px; max-height: 350px; font: 14px/1.7 var(--font-body); border: 1px solid var(--ui-control-border); color: var(--ui-text); background: var(--ui-surface); border-radius: 6px; padding: 12px 14px; }
.evidence-controls { display: flex; align-items: center; justify-content: space-between; gap: 15px; margin: 12px 0 18px; }
.evidence-controls > div { display: flex; align-items: center; gap: 14px; }
.provider-picker, .history-filter { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--ui-muted); }
select { max-width: 200px; border: 1px solid var(--ui-border); border-radius: 5px; background: var(--ui-surface); color: var(--ui-text); padding: 8px; font: 12px var(--font-body); }
.matched-passages { border-top: 1px solid var(--ui-border); border-bottom: 1px solid var(--ui-border); margin-top: 20px; padding: 14px 0; font-size: 13px; }
.matched-passages summary { color: var(--ui-accent); cursor: pointer; }
.evidence-result { margin-top: 30px; border-top: 1px solid var(--ui-border); padding-top: 28px; }
.result-heading h3 { font: 400 27px/1.35 var(--font-display); letter-spacing: -.02em; }
.result-heading > div:first-child { min-width: 0; }
.export-actions { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; }
.export-actions .research-button { min-height: 32px; font-size: 11px; padding: 7px 10px; }
.review-summary { font-size: 15px; margin: 18px 0; }
.review-claim { padding: 18px 0; border-bottom: 1px solid var(--ui-border); font-size: 14px; }
.review-claim > div { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; margin-top: 10px; }
.citation-button { border: 1px solid var(--ui-border); color: var(--ui-accent); background: var(--ui-selected); border-radius: 3px; padding: 4px 7px; cursor: pointer; font: 11px var(--font-data); }
.uncited-label { font-size: 11px; color: var(--ui-warning); }
.review-questions { margin-top: 24px; }
.review-questions ul { padding-left: 20px; margin: 8px 0 18px; font-size: 14px; line-height: 1.8; }
.plain-review { white-space: pre-wrap; font-size: 14px; margin-bottom: 20px; }
.citation-detail { margin-top: 24px; padding: 20px; border: 1px solid var(--ui-accent); border-radius: 6px; background: var(--ui-selected); scroll-margin: 20px; }
.citation-detail .section-heading { margin-bottom: 8px; align-items: center; }
.citation-detail h4 { margin: 0; overflow-wrap: anywhere; }
.citation-detail a { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; margin-top: 14px; color: var(--ui-accent); }
.review-sources { margin-top: 28px; }
.review-source { display: flex; align-items: center; gap: 14px; border: 0; border-top: 1px solid var(--ui-border); padding: 15px 0; text-align: left; background: transparent; color: var(--ui-text); width: 100%; cursor: pointer; }
.review-source > span { font: 11px var(--font-data); color: var(--ui-accent); }
.review-source > div { flex: 1; min-width: 0; }
.review-source strong { display: block; font-size: 13px; line-height: 1.5; overflow-wrap: anywhere; }
.review-source small { display: block; color: var(--ui-muted); margin-top: 4px; font-size: 11px; }
.history-heading { margin: 30px 0 14px; }
.history-heading span { color: var(--ui-muted); font: 12px var(--font-data); margin-left: 7px; }
.history-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; border-top: 1px solid var(--ui-border); padding: 22px 0; }
.history-body { min-width: 0; flex: 1; }
.history-body h4 { margin-top: 9px; overflow-wrap: anywhere; }
.history-body > p { font-size: 13px; color: var(--ui-muted); overflow-wrap: anywhere; }
.history-metadata { display: flex; gap: 6px; align-items: center; color: var(--ui-muted); font-size: 11px; }
.history-actions { display: flex; flex-direction: column; gap: 14px; align-items: flex-end; }
.legacy-export { margin-top: 36px; padding-top: 26px; border-top: 1px solid var(--ui-border); }
.legacy-export p { max-width: 670px; margin-bottom: 14px; }
.legacy-export .research-button { margin-bottom: 14px; }
.visually-hidden { position: absolute; height: 1px; width: 1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; }
@media (max-width: 900px) {
  .research-tools { padding: 28px 24px 48px; }
  .research-heading { flex-direction: column; gap: 12px; }
  .research-scope { max-width: none; }
  .evidence-controls { align-items: flex-start; flex-direction: column; }
  .evidence-controls > div { width: 100%; justify-content: space-between; }
}
@media (max-width: 620px) {
  .research-tools { padding: 24px 16px 48px; }
  h1 { font-size: 34px; }
  .research-tabs { gap: 17px; overflow-x: auto; }
  .research-tabs button { font-size: 12px; gap: 6px; }
  .research-tabs button > svg { display: none; }
  .section-heading, .result-heading { flex-direction: column; gap: 15px; }
  .source-layout { grid-template-columns: minmax(0, 1fr); }
  .source-list { border-right: 0; border-bottom: 1px solid var(--ui-border); max-height: 280px; overflow: auto; }
  .source-preview { padding: 18px; max-height: 420px; }
  .source-actions { align-items: flex-start; }
  .source-actions .research-button { white-space: normal; max-width: 180px; }
  .active-study { flex-wrap: wrap; }
  .active-study > div { min-width: 180px; }
  .history-row { flex-direction: column; gap: 15px; }
  .history-actions { align-items: flex-start; flex-direction: row; justify-content: space-between; width: 100%; flex-wrap: wrap; }
  .history-metadata { flex-wrap: wrap; }
  .provider-picker { gap: 5px; font-size: 11px; }
  .provider-picker select { max-width: 106px; }
  .evidence-controls > div { gap: 9px; }
  .citation-detail .section-heading { flex-direction: row; }
}
</style>
