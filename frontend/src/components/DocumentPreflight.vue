<script setup>
import { computed, nextTick, onUnmounted, ref, watch } from 'vue';
import AppIcon from './AppIcon.vue';
import { analyzePacket, createSamplePacket, PREFLIGHT_CATEGORIES, CHECK_SCOPE } from '../lib/documentPreflight.js';
import { importPreflightFiles, PREFLIGHT_IMPORT_ACCEPT, PREFLIGHT_LIMITS } from '../lib/preflightImports.js';

const props = defineProps({
  storageKey: { type: String, default: 'microfish.document-preflight.v1' },
  sampleDefault: { type: Boolean, default: true },
});
const STORAGE_KEY = props.storageKey;
const MAX_DOCUMENTS = PREFLIGHT_LIMITS.documents;
const MAX_TEXT = PREFLIGHT_LIMITS.documentChars;
const MAX_PACKET = PREFLIGHT_LIMITS.packetChars;
const kinds = { protocol: 'Protocol', consent: 'Consent', onboarding: 'Onboarding', training: 'Training record', other: 'Other document' };
const categoryIcons = { missing: 'document', conflict: 'branch', outdated: 'clock', question: 'question' };
const categoryLabels = { missing: 'Missing items', conflict: 'Conflicting instructions', outdated: 'Outdated versions', question: 'Unanswered questions' };
const notice = ref('');
const storageNotice = ref('');
const heading = ref(null);
const fileInput = ref(null);
const editor = ref(null);
const nameInput = ref(null);
const reviewTabs = ref(null);
const selectedFinding = ref(null);
const category = ref('all');
const reviewFilter = ref('open');
const running = ref(false);
const importing = ref(false);
const editorError = ref('');
const draft = ref({ id: '', name: '', kind: 'other', version: '', text: '' });
let editorTrigger;
let pendingFrame;
let disposed = false;
const undoPacket = ref(null);

function validDocument(document) {
  return document && typeof document.id === 'string' && typeof document.name === 'string'
    && typeof document.text === 'string' && document.text.length <= MAX_TEXT
    && Object.hasOwn(kinds, document.kind) && typeof document.version === 'string';
}
function restore() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (!saved) return null;
    if (!Array.isArray(saved.documents) || saved.documents.length > MAX_DOCUMENTS
      || !saved.documents.every(validDocument)
      || new Set(saved.documents.map(document => document.id)).size !== saved.documents.length
      || saved.documents.reduce((total, document) => total + document.text.length, 0) > MAX_PACKET) throw new Error('Invalid saved packet');
    return saved;
  } catch {
    storageNotice.value = 'The saved packet could not be loaded. Changes will stay available in this tab.';
    return null;
  }
}
const saved = restore();
const documents = ref(saved?.documents ?? (props.sampleDefault ? createSamplePacket() : []));
const isExample = ref(saved ? saved.isExample === true : props.sampleDefault);
const hasScanned = ref(saved ? saved.hasScanned === true : props.sampleDefault);
const lastScannedAt = ref(saved?.lastScannedAt || null);
const reviewed = ref(Array.isArray(saved?.reviewed) ? saved.reviewed.filter(id => typeof id === 'string') : []);
const results = ref(hasScanned.value ? analyzePacket(documents.value) : { findings: [], checksRun: 0 });
const openFindings = computed(() => results.value.findings.filter(finding => !reviewed.value.includes(finding.id)));
const reviewedCount = computed(() => results.value.findings.length - openFindings.value.length);
const visibleFindings = computed(() => results.value.findings.filter(finding =>
  (category.value === 'all' || finding.category === category.value)
  && (reviewFilter.value === 'reviewed' ? reviewed.value.includes(finding.id) : !reviewed.value.includes(finding.id)),
));
const checkedTime = computed(() => lastScannedAt.value ? new Date(lastScannedAt.value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : null);
const currentCategoryName = computed(() => category.value === 'all' ? 'All findings' : categoryLabels[category.value]);
const reviewProgress = computed(() => results.value.findings.length ? Math.round(reviewedCount.value / results.value.findings.length * 100) : 0);

function savePacket() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ documents: documents.value, isExample: isExample.value, hasScanned: hasScanned.value, reviewed: reviewed.value, lastScannedAt: lastScannedAt.value }));
    storageNotice.value = '';
  } catch {
    storageNotice.value = 'Browser storage is unavailable or full. Your packet is available in this tab; export the review before closing it.';
  }
}
watch([documents, isExample, hasScanned, reviewed, lastScannedAt], savePacket, { deep: true });
function invalidate() {
  hasScanned.value = false;
  results.value = { findings: [], checksRun: 0 };
  reviewed.value = [];
  selectedFinding.value = null;
  category.value = 'all';
  reviewFilter.value = 'open';
  lastScannedAt.value = null;
}
function backup() {
  undoPacket.value = { documents: documents.value.map(document => ({ ...document })), isExample: isExample.value };
}
function undoChange() {
  if (!undoPacket.value) return;
  documents.value = undoPacket.value.documents;
  isExample.value = undoPacket.value.isExample;
  undoPacket.value = null;
  invalidate();
  notice.value = 'Previous packet restored. Run preflight to refresh the findings.';
}
async function runPreflight() {
  if (running.value || importing.value || !documents.value.length) return;
  running.value = true;
  notice.value = '';
  await nextTick();
  await new Promise(resolve => { pendingFrame = requestAnimationFrame(resolve); });
  if (disposed) return;
  try {
    results.value = analyzePacket(documents.value);
    reviewed.value = [];
    selectedFinding.value = results.value.findings[0]?.id ?? null;
    hasScanned.value = true;
    lastScannedAt.value = new Date().toISOString();
    category.value = 'all';
    reviewFilter.value = 'open';
  } catch {
    notice.value = 'This packet could not be checked. Review the document text and try again.';
    invalidate();
  } finally {
    running.value = false;
  }
}
function categoryCount(id) {
  return results.value.findings.filter(finding => finding.category === id).length;
}
function selectCategory(id) {
  category.value = category.value === id ? 'all' : id;
  selectedFinding.value = null;
}
async function toggleReviewed(finding) {
  reviewed.value = reviewed.value.includes(finding.id)
    ? reviewed.value.filter(id => id !== finding.id)
    : [...reviewed.value, finding.id];
  selectedFinding.value = null;
  await nextTick();
  reviewTabs.value?.querySelector('.active')?.focus();
}
function newId() {
  return crypto.randomUUID ? crypto.randomUUID() : `document-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
async function editDocument(document) {
  if (running.value || importing.value) return;
  if (!document && !isExample.value && documents.value.length >= MAX_DOCUMENTS) {
    notice.value = `This packet can hold ${MAX_DOCUMENTS} documents. Remove a document before adding another.`;
    return;
  }
  editorTrigger = documentGlobalActiveElement();
  draft.value = document ? { ...document } : { id: newId(), name: '', kind: 'other', version: '', text: '' };
  editorError.value = '';
  editor.value.showModal();
  await nextTick();
  nameInput.value?.focus();
}
function documentGlobalActiveElement() { return window.document.activeElement; }
function closeEditor() { editor.value.close(); }
function restoreEditorFocus() { editorTrigger?.isConnected && editorTrigger.focus(); }
function saveDocument() {
  const entry = { ...draft.value, name: draft.value.name.trim(), version: draft.value.version.trim() };
  if (!entry.name || !entry.text.trim()) { editorError.value = 'Add a document name and its text before saving.'; return; }
  if (entry.text.length > MAX_TEXT) { editorError.value = 'Each document can contain up to 100,000 characters.'; return; }
  const startingOwnPacket = isExample.value && !documents.value.some(document => document.id === entry.id);
  const others = startingOwnPacket ? [] : documents.value.filter(document => document.id !== entry.id);
  if (others.reduce((total, document) => total + document.text.length, entry.text.length) > MAX_PACKET) { editorError.value = 'This packet exceeds the 500,000 character limit. Shorten a document or remove one.'; return; }
  backup();
  if (startingOwnPacket) documents.value = [];
  const index = documents.value.findIndex(document => document.id === entry.id);
  if (index === -1) documents.value.push(entry);
  else documents.value[index] = entry;
  isExample.value = false;
  invalidate();
  notice.value = startingOwnPacket ? 'Your packet is started. The example documents have been set aside. Run preflight when your documents are ready.' : 'Document saved. Run preflight to check the updated packet.';
  closeEditor();
}
function removeDocument(id) {
  backup();
  documents.value = documents.value.filter(document => document.id !== id);
  isExample.value = false;
  invalidate();
  notice.value = 'Document removed from the packet.';
}
async function importFiles(files) {
  if (!files?.length || importing.value || running.value) return;
  importing.value = true;
  const startingOwnPacket = isExample.value;
  const baseDocuments = startingOwnPacket ? [] : documents.value;
  try {
    const { added, errors } = await importPreflightFiles(files, { existingDocuments: baseDocuments, id: newId });
    if (disposed) return;
    if (added.length) {
      backup();
      if (startingOwnPacket) documents.value = [];
      documents.value.push(...added);
      isExample.value = false;
      invalidate();
    }
    notice.value = [added.length ? `${added.length} document${added.length === 1 ? '' : 's'} added.${startingOwnPacket ? ' Example documents set aside.' : ''} Check each document’s type and version, then run preflight.` : '', ...errors].filter(Boolean).join(' ');
  } catch {
    notice.value = 'The files could not be imported. Your current packet has been kept. Try again or upload the Markdown files individually.';
  } finally {
    importing.value = false;
    if (fileInput.value) fileInput.value.value = '';
  }
}
async function loadExample() {
  backup();
  documents.value = createSamplePacket();
  isExample.value = true;
  invalidate();
  await runPreflight();
  notice.value = 'Fictional example packet loaded.';
}
function exportReview() {
  if (!hasScanned.value) return;
  const lines = ['# Document preflight review', '', `Exported: ${new Date().toISOString()}`, `Packet: ${isExample.value ? 'Fictional REST-101 example' : 'Uploaded / edited documents'}`, '', '## Scope', CHECK_SCOPE, '', 'This review flags potential issues for human review. Marking a finding reviewed does not change a document or grant approval.', '', '## Documents', ...documents.value.map(document => `- ${document.name} (${kinds[document.kind]}, version ${document.version || 'not supplied'})`), '', '## Findings'];
  for (const finding of results.value.findings) {
    lines.push('', `### ${finding.title}`, `Category: ${categoryLabels[finding.category]} · ${reviewed.value.includes(finding.id) ? 'Reviewed' : 'Open'}`, '', finding.summary, '', `Next step: ${finding.recommendation}`);
    for (const source of finding.sources) lines.push('', `Source: ${source.documentName}, line ${source.line}`, `> ${source.quote.replace(/\n/g, '\n> ')}`);
  }
  if (!results.value.findings.length) lines.push('', 'No findings from the supported text checks. This does not establish that the packet is complete or approved.');
  const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' }));
  const anchor = window.document.createElement('a');
  anchor.href = url;
  anchor.download = 'document-preflight-review.md';
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function focusHeading() { heading.value?.focus(); }
defineExpose({ focusHeading });
onUnmounted(() => { disposed = true; cancelAnimationFrame(pendingFrame); });
</script>

<template>
  <main class="preflight-page" aria-labelledby="preflight-heading">
    <div class="pf-content">
      <header class="pf-header">
        <div>
          <h1 id="preflight-heading" ref="heading" tabindex="-1">Document preflight</h1>
          <p>A closer look at the details your study depends on.</p>
        </div>
        <div class="pf-header-actions">
          <button class="pf-button pf-secondary" :disabled="!hasScanned || running" @click="exportReview"><AppIcon name="download" :size="16" /><span>Export review</span></button>
          <button class="pf-button pf-primary" :disabled="!documents.length || running || importing" @click="runPreflight"><AppIcon :name="running ? 'clock' : 'spark'" :size="16" />{{ running ? 'Checking packet…' : 'Run preflight' }}</button>
        </div>
      </header>

      <div class="pf-context">
        <span class="pf-packet-label"><span class="pf-green-dot"></span>{{ isExample ? 'REST-101 · Example packet' : 'Your document packet' }}</span>
        <span>{{ documents.length }} {{ documents.length === 1 ? 'document' : 'documents' }}</span><span class="pf-context-divider">/</span>
        <span>{{ hasScanned ? checkedTime ? `Last checked at ${checkedTime}` : 'Example findings ready to explore' : 'Ready for a fresh check' }}</span>
        <span v-if="isExample" class="pf-example-badge">Fictional study</span>
      </div>

      <div v-if="notice || storageNotice" class="pf-notice" role="status">
        <AppIcon name="info" :size="17" /><span>{{ notice }} {{ storageNotice }}</span>
        <button v-if="undoPacket" class="pf-text-button" :disabled="running || importing" @click="undoChange">Undo</button>
      </div>
      <span class="sr-only" aria-live="polite">{{ running ? 'Checking documents.' : hasScanned ? `Preflight complete. ${openFindings.length} open findings, ${reviewedCount} reviewed.` : 'Packet changed. Run preflight to refresh findings.' }}</span>

      <div class="pf-metrics" role="group" aria-label="Filter findings by category">
        <button v-for="item in PREFLIGHT_CATEGORIES" :key="item.id" class="pf-metric" :class="[item.id, { selected: category === item.id }]" :aria-pressed="category === item.id" @click="selectCategory(item.id)">
          <div class="pf-metric-top"><span class="pf-metric-icon"><AppIcon :name="categoryIcons[item.id]" :size="19" /></span><strong>{{ hasScanned ? categoryCount(item.id) : '—' }}</strong></div>
          <span class="pf-metric-label">{{ categoryLabels[item.id] }}</span>
          <span class="pf-metric-link">{{ hasScanned ? 'View findings' : 'Awaiting check' }}<AppIcon name="arrow-up-right" :size="13" /></span>
        </button>
      </div>

      <div class="pf-workbench">
        <section class="pf-packet-panel" aria-labelledby="packet-heading">
          <div class="pf-panel-heading"><h2 id="packet-heading">Your packet</h2><span class="pf-count">{{ documents.length }}</span></div>
          <p class="pf-panel-description">{{ isExample ? 'Explore this example, or add your own files to start a fresh packet.' : 'Keep the documents for one study together.' }}</p>
          <input ref="fileInput" class="sr-only" type="file" :accept="PREFLIGHT_IMPORT_ACCEPT" multiple tabindex="-1" aria-label="Upload packet documents" @change="importFiles($event.target.files)" />
          <button type="button" class="pf-upload" :disabled="importing || running" @click="fileInput?.click()" @dragover.prevent @drop.prevent="importFiles($event.dataTransfer.files)">
            <span class="pf-upload-icon"><AppIcon name="upload" :size="21" /></span>
            <strong>{{ importing ? 'Reading documents…' : 'Add documents' }}</strong>
            <span>Drop files here or browse</span><small>Text, Markdown & ZIP · up to 12 documents</small>
          </button>
          <button class="pf-paste-button" :disabled="importing || running" @click="editDocument()"><AppIcon name="plus" :size="15" /> Paste document text</button>
          <div class="pf-document-list">
            <div v-for="document in documents" :key="document.id" class="pf-document">
              <button class="pf-document-open" :disabled="running || importing" @click="editDocument(document)" :aria-label="`Edit ${document.name}`">
                <span class="pf-file-icon"><AppIcon name="document" :size="19" /></span>
                <span class="pf-document-text"><strong>{{ document.name }}</strong><span>{{ kinds[document.kind] }}<template v-if="document.version"> · v{{ document.version }}</template></span></span>
              </button>
              <button class="pf-remove" :disabled="running || importing" :aria-label="`Remove ${document.name}`" @click="removeDocument(document.id)"><AppIcon name="close" :size="13" /></button>
            </div>
            <p v-if="!documents.length" class="pf-empty-packet">Add your first document to get started.</p>
          </div>
          <div class="pf-packet-footer"><AppIcon name="lock" :size="14" /><span>Files stay in this browser.</span></div>
          <button class="pf-example-button" :disabled="running || importing" @click="loadExample"><AppIcon name="reset" :size="14" />{{ isExample ? 'Reset example packet' : 'Load example packet' }}</button>
        </section>

        <section class="pf-findings-panel" aria-labelledby="findings-heading" :aria-busy="running">
          <div class="pf-findings-heading">
            <div><h2 id="findings-heading">Findings</h2><p>{{ hasScanned ? `${openFindings.length} ${openFindings.length === 1 ? 'item needs' : 'items need'} your attention` : 'Check the packet to see what needs attention' }}</p></div>
            <span v-if="hasScanned" class="pf-review-badge"><AppIcon :name="openFindings.length ? 'alert' : 'check'" :size="14" />{{ openFindings.length ? 'Review needed' : results.findings.length ? 'Review complete' : 'Checks complete' }}</span>
          </div>
          <div class="pf-findings-toolbar">
            <div ref="reviewTabs" class="pf-review-tabs" role="group" aria-label="Finding status">
              <button :class="{ active: reviewFilter === 'open' }" :aria-pressed="reviewFilter === 'open'" @click="reviewFilter = 'open'">Open <span>{{ openFindings.length }}</span></button>
              <button :class="{ active: reviewFilter === 'reviewed' }" :aria-pressed="reviewFilter === 'reviewed'" @click="reviewFilter = 'reviewed'">Reviewed <span>{{ reviewedCount }}</span></button>
            </div>
            <button class="pf-filter-reset" :disabled="category === 'all'" @click="category = 'all'">{{ currentCategoryName }}<AppIcon v-if="category !== 'all'" name="close" :size="12" /></button>
          </div>

          <div v-if="!hasScanned" class="pf-empty">
            <span class="pf-empty-icon"><AppIcon name="document-check" :size="29" /></span>
            <h3>{{ documents.length ? 'Your packet is ready for a check' : 'Start with your study documents' }}</h3>
            <p>{{ documents.length ? 'Run preflight to find missing items, mismatched details, older versions, and open questions in this packet.' : 'Upload text or Markdown files, paste document text, or explore the example packet.' }}</p>
            <button v-if="documents.length" class="pf-button pf-primary" :disabled="running || importing" @click="runPreflight"><AppIcon name="spark" :size="15" /> Run preflight</button>
            <button v-else class="pf-button pf-primary" :disabled="running || importing" @click="loadExample">Explore example packet</button>
          </div>
          <div v-else-if="!visibleFindings.length" class="pf-empty">
            <span class="pf-empty-icon"><AppIcon name="check" :size="29" /></span>
            <h3>{{ !results.findings.length ? 'No findings from these checks' : reviewFilter === 'reviewed' ? 'No reviewed findings here yet' : 'No open findings here' }}</h3>
            <p>{{ !results.findings.length ? 'The supported text checks found no issues. Review the full packet for requirements outside these checks.' : reviewFilter === 'reviewed' ? 'Open a finding, check its source, and mark it reviewed when you have considered the next step.' : 'Your review is saved. Update the source documents and rerun preflight to check your changes.' }}</p>
            <button v-if="category !== 'all'" class="pf-text-button" @click="category = 'all'">Show all categories</button>
          </div>
          <div v-else class="pf-findings-list">
            <article v-for="finding in visibleFindings" :key="finding.id" class="pf-finding" :class="{ expanded: selectedFinding === finding.id, reviewed: reviewed.includes(finding.id) }">
              <button class="pf-finding-summary" :aria-expanded="selectedFinding === finding.id" :aria-controls="`detail-${finding.id}`" @click="selectedFinding = selectedFinding === finding.id ? null : finding.id">
                <span class="pf-finding-symbol" :class="finding.category"><AppIcon :name="categoryIcons[finding.category]" :size="18" /></span>
                <span class="pf-finding-copy"><span class="pf-finding-meta"><span :class="['pf-category-tag', finding.category]">{{ categoryLabels[finding.category] }}</span><span v-if="finding.severity === 'high'" class="pf-priority">High priority</span><span v-if="reviewed.includes(finding.id)" class="pf-reviewed-label"><AppIcon name="check" :size="12" />Reviewed</span></span><strong>{{ finding.title }}</strong><span class="pf-finding-description">{{ finding.summary }}</span><span class="pf-source-count"><AppIcon name="document" :size="12" />{{ finding.sources.length ? `${finding.sources.length} source ${finding.sources.length === 1 ? 'reference' : 'references'}` : 'Packet completeness check' }}</span></span>
                <AppIcon class="pf-finding-chevron" name="chevron" :size="15" />
              </button>
              <div v-if="selectedFinding === finding.id" :id="`detail-${finding.id}`" class="pf-finding-detail">
                <div v-if="finding.sources.length" class="pf-evidence-list">
                  <div v-for="(source, index) in finding.sources" :key="index" class="pf-evidence">
                    <button @click="editDocument(documents.find(document => document.id === source.documentId))"><AppIcon name="document" :size="13" /><span>{{ source.documentName }}</span><span class="pf-line">Line {{ source.line }}</span><AppIcon name="arrow-up-right" :size="12" /></button>
                    <blockquote>{{ source.quote }}</blockquote>
                  </div>
                </div>
                <div class="pf-next-step"><span>Suggested next step</span><p>{{ finding.recommendation }}</p></div>
                <div class="pf-review-action"><span>Review records your decision; edit the source to fix the issue.</span><button class="pf-button pf-review-button" @click="toggleReviewed(finding)"><AppIcon :name="reviewed.includes(finding.id) ? 'reset' : 'check'" :size="14" />{{ reviewed.includes(finding.id) ? 'Reopen finding' : 'Mark reviewed' }}</button></div>
              </div>
            </article>
          </div>
          <div v-if="hasScanned && results.findings.length" class="pf-progress-row"><span>{{ reviewedCount }} of {{ results.findings.length }} findings reviewed</span><div class="pf-progress" role="progressbar" aria-label="Findings reviewed" :aria-valuenow="reviewedCount" :aria-valuemax="results.findings.length" :aria-valuemin="0"><span :style="{ width: `${reviewProgress}%` }"></span></div><strong>{{ reviewProgress }}%</strong></div>
        </section>
      </div>

      <footer class="pf-scope"><AppIcon name="info" :size="15" /><div><strong>A preparation check, with you in control.</strong><p>{{ CHECK_SCOPE }} Findings need your review and do not constitute institutional approval.</p></div></footer>
    </div>

    <dialog ref="editor" class="pf-editor" aria-labelledby="document-editor-title" @close="restoreEditorFocus" @click="$event.target === editor && closeEditor()">
      <form @submit.prevent="saveDocument">
        <div class="pf-editor-heading"><div><h2 id="document-editor-title">{{ documents.some(document => document.id === draft.id) ? 'Edit document' : 'Add document text' }}</h2></div><button type="button" class="icon-button" aria-label="Close document editor" @click="closeEditor"><AppIcon name="close" /></button></div>
        <label>Document name<input ref="nameInput" v-model="draft.name" maxlength="160" placeholder="e.g. Study protocol.md" required /></label>
        <div class="pf-editor-fields"><label>Document type<select v-model="draft.kind"><option v-for="(label, id) in kinds" :key="id" :value="id">{{ label }}</option></select></label><label>Version<input v-model="draft.version" maxlength="30" placeholder="e.g. 2.0" /></label></div>
        <label>Document text<textarea v-model="draft.text" rows="13" spellcheck="false" placeholder="Paste the document text here. Preserve headings and line breaks so findings can link to their sources." required></textarea></label>
        <p class="pf-editor-hint">Checks use explicit fields such as “Study ID:”, “Clinic visits:”, and “Contact owner:”, plus version metadata and unresolved questions. You can correct the document type or version above.</p>
        <p v-if="editorError" class="pf-editor-error" role="alert">{{ editorError }}</p>
        <div class="pf-editor-actions"><button type="button" class="pf-button pf-secondary" @click="closeEditor">Cancel</button><button class="pf-button pf-primary" type="submit">Save document</button></div>
      </form>
    </dialog>
  </main>
</template>

<style scoped>
.preflight-page { flex: 1; min-width: 0; min-height: 0; overflow-y: auto; background: var(--ui-canvas); color: var(--ui-text); }
.pf-content { max-width: 1480px; padding: 36px 32px 28px; margin: 0 auto; }
.preflight-page button { min-height: 36px; }
.preflight-page button:not(:disabled):active { filter: brightness(.94); }
.preflight-page button:disabled { cursor: not-allowed; opacity: .55; }
.preflight-page svg { flex-shrink: 0; }
.pf-header { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 24px; margin-bottom: 20px; }
.pf-header h1 { font-family: var(--font-display); font-size: clamp(2.5rem, 3.4vw, 3.5rem); line-height: 1.1; font-weight: 400; letter-spacing: -.045em; margin: 0 0 12px; color: var(--ui-text); }
.pf-header h1 span { color: var(--ui-accent); }
.pf-header p { color: var(--ui-muted); font-size: .9375rem; line-height: 1.6; margin: 0; }
.pf-header-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.pf-button { display: inline-flex; align-items: center; justify-content: center; gap: 8px; border-radius: 4px; padding: 10px 14px; font-size: .8125rem; line-height: 1.4; font-weight: 550; border: 1px solid transparent; }
.pf-primary { color: var(--ui-on-accent); background: var(--ui-accent); border-color: var(--ui-accent); }
.pf-primary:hover:not(:disabled) { filter: brightness(.94); }
.pf-secondary { background: var(--ui-surface); border-color: var(--ui-control-border); color: var(--ui-text); }
.pf-secondary:hover:not(:disabled) { background: var(--ui-hover); }
.pf-context { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; font-size: .75rem; line-height: 1.5; color: var(--ui-muted); margin-bottom: 28px; }
.pf-packet-label { display: inline-flex; gap: 7px; align-items: center; font-weight: 600; color: var(--ui-text); }
.pf-green-dot { width: 6px; height: 6px; flex-shrink: 0; border-radius: 50%; background: var(--ui-accent); }
.pf-context-divider { color: var(--ui-muted); }
.pf-example-badge { margin-left: auto; padding: 4px 8px; background: var(--ui-surface-alt); border: 1px solid var(--ui-border); border-radius: 5px; color: var(--ui-muted); }
.pf-notice { display: flex; gap: 10px; align-items: center; background: var(--ui-surface-alt); border: 1px solid var(--ui-border); border-radius: 10px; padding: 12px 16px; margin-bottom: 18px; font-size: .875rem; line-height: 1.6; }
.pf-notice > span { flex: 1; overflow-wrap: anywhere; }
.pf-text-button { padding: 8px; background: none; border: 0; color: var(--ui-accent); text-decoration: underline; text-underline-offset: 3px; font-size: .875rem; }
.pf-metrics { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0; border-block: 1px solid var(--ui-border); margin-bottom: 32px; }
.pf-metric { min-width: 0; border: 0; border-right: 1px solid var(--ui-border); border-bottom: 2px solid transparent; border-radius: 0; background: transparent; padding: 18px 20px; text-align: left; transition: background .15s; }
.pf-metric:hover { background: var(--ui-hover); }
.pf-metric.selected { border-bottom-color: var(--ui-accent); background: var(--ui-selected); }
.pf-metric-top { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 12px; }
.pf-metric-icon { height: 24px; width: 24px; flex-shrink: 0; border-radius: 3px; display: grid; place-items: center; }
.missing .pf-metric-icon, .pf-finding-symbol.missing { color: var(--ui-warning); background: var(--ui-warning-bg); }
.conflict .pf-metric-icon, .pf-finding-symbol.conflict { color: var(--ui-danger); background: var(--ui-danger-bg); }
.outdated .pf-metric-icon, .pf-finding-symbol.outdated { color: var(--ui-info); background: var(--ui-info-bg); }
.question .pf-metric-icon, .pf-finding-symbol.question { color: var(--ui-purple); background: var(--ui-purple-bg); }
.pf-metric-top strong { font-family: var(--font-display); font-size: 2.25rem; font-weight: 400; line-height: 1; color: var(--ui-text); font-variant-numeric: tabular-nums; }
.pf-metric-label { display: block; font-size: .875rem; font-weight: 600; color: var(--ui-text); margin-bottom: 10px; line-height: 1.5; overflow-wrap: anywhere; }
.pf-metric-link { display: flex; justify-content: space-between; align-items: center; gap: 5px; color: var(--ui-muted); font-size: .75rem; line-height: 1.5; }
.pf-workbench { display: grid; grid-template-columns: minmax(0, 272px) minmax(0, 1fr); gap: 24px; align-items: start; }
.pf-packet-panel { min-width: 0; border: 1px solid var(--ui-border); background: var(--ui-surface-alt); border-radius: 4px; padding: 20px 16px 12px; }
.pf-panel-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.pf-panel-heading h2, .pf-findings-heading h2 { margin: 0; font-family: var(--font-display); font-size: 1.5rem; font-weight: 400; letter-spacing: -.025em; color: var(--ui-text); }
.pf-count { display: grid; place-items: center; min-width: 24px; min-height: 24px; padding: 2px 6px; border-radius: 6px; background: var(--ui-surface); color: var(--ui-muted); font-size: .75rem; }
.pf-panel-description { margin: 10px 0 18px; font-size: .875rem; line-height: 1.6; color: var(--ui-muted); }
.pf-upload { display: flex; flex-direction: column; align-items: center; width: 100%; background: var(--ui-surface); border: 1px dashed var(--ui-control-border); border-radius: 9px; padding: 20px 12px; color: var(--ui-accent); text-align: center; }
.pf-upload:hover { background: var(--ui-hover); }
.pf-upload-icon { margin-bottom: 12px; }
.pf-upload strong { font-size: .875rem; font-weight: 600; }
.pf-upload > span:not(.pf-upload-icon) { font-size: .75rem; line-height: 1.5; margin-top: 6px; color: var(--ui-muted); }
.pf-upload small { font-size: .75rem; line-height: 1.5; color: var(--ui-muted); margin-top: 10px; }
.pf-paste-button { display: flex; align-items: center; justify-content: center; gap: 6px; width: 100%; margin-top: 6px; padding: 10px 4px; color: var(--ui-accent); background: none; border: 0; border-radius: 6px; font-size: .875rem; line-height: 1.4; }
.pf-paste-button:hover { background: var(--ui-hover); }
.pf-document-list { margin-top: 12px; }
.pf-document { display: flex; align-items: center; gap: 4px; border-bottom: 1px solid var(--ui-border); padding: 8px 0; }
.pf-document-open { display: flex; align-items: center; gap: 10px; min-width: 0; flex: 1; text-align: left; padding: 6px 0; border: 0; border-radius: 5px; background: none; }
.pf-document-open:hover { background: var(--ui-hover); }
.pf-document-open:hover strong { color: var(--ui-accent); }
.pf-file-icon { height: 36px; width: 30px; background: var(--ui-surface); border: 1px solid var(--ui-border); border-radius: 5px; display: grid; place-items: center; color: var(--ui-muted); flex-shrink: 0; }
.pf-document-text { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
.pf-document-text strong { font-weight: 600; color: var(--ui-text); font-size: .875rem; line-height: 1.45; overflow-wrap: anywhere; }
.pf-document-text > span { color: var(--ui-muted); font-size: .75rem; line-height: 1.5; overflow-wrap: anywhere; }
.pf-remove { display: grid; place-items: center; flex-shrink: 0; width: 36px; border: 0; background: none; padding: 8px; color: var(--ui-muted); border-radius: 6px; }
.pf-remove:hover { background: var(--ui-danger-bg); color: var(--ui-danger); }
.pf-packet-footer { display: flex; align-items: center; gap: 7px; color: var(--ui-muted); font-size: .75rem; line-height: 1.5; padding: 18px 0 6px; }
.pf-example-button { display: flex; align-items: center; gap: 7px; padding: 8px 0; border: 0; background: none; color: var(--ui-accent); border-radius: 6px; font-size: .75rem; line-height: 1.5; text-align: left; }
.pf-example-button:hover { text-decoration: underline; text-underline-offset: 3px; }
.pf-empty-packet { font-size: .875rem; color: var(--ui-muted); padding: 12px 0; line-height: 1.6; }
.pf-findings-panel { min-width: 0; }
.pf-findings-heading { display: flex; flex-wrap: wrap; gap: 12px; justify-content: space-between; align-items: center; padding: 2px 0 18px; }
.pf-findings-heading p { color: var(--ui-muted); font-size: .875rem; line-height: 1.5; margin: 7px 0 0; }
.pf-review-badge { display: flex; gap: 6px; align-items: center; padding: 6px 8px; border: 1px solid var(--ui-warning); border-radius: 6px; background: var(--ui-warning-bg); color: var(--ui-warning); font-size: .75rem; line-height: 1.4; }
.pf-findings-toolbar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; border-bottom: 1px solid var(--ui-border); margin-bottom: 16px; }
.pf-review-tabs { display: flex; gap: 16px; }
.pf-review-tabs button { display: flex; align-items: center; gap: 6px; padding: 10px 2px 12px; border: 0; border-bottom: 2px solid transparent; background: none; color: var(--ui-muted); font-size: .875rem; line-height: 1.5; }
.pf-review-tabs button:hover { color: var(--ui-accent); }
.pf-review-tabs button.active { color: var(--ui-accent); border-bottom-color: var(--ui-accent); font-weight: 650; }
.pf-review-tabs span { display: grid; place-items: center; border-radius: 5px; background: var(--ui-surface-alt); color: var(--ui-muted); min-width: 22px; min-height: 22px; padding: 2px 5px; font-size: .75rem; }
.pf-filter-reset { display: flex; align-items: center; gap: 6px; background: none; border: 0; padding: 8px 0; font-size: .75rem; line-height: 1.5; color: var(--ui-accent); text-align: left; }
.pf-filter-reset:hover:not(:disabled) { text-decoration: underline; text-underline-offset: 3px; }
.preflight-page .pf-filter-reset:disabled { cursor: default; opacity: 1; color: var(--ui-muted); }
.pf-findings-list { display: grid; gap: 0; border-top: 1px solid var(--ui-border); }
.pf-finding { border: 0; border-bottom: 1px solid var(--ui-border); background: var(--ui-surface); border-radius: 0; }
.pf-finding:hover, .pf-finding.expanded { border-color: var(--ui-control-border); }
.pf-finding-summary { display: flex; align-items: flex-start; gap: 12px; width: 100%; padding: 20px 18px; background: none; border: 0; border-radius: 0; text-align: left; }
.pf-finding-summary:hover { background: var(--ui-hover); }
.pf-finding-symbol { height: 36px; width: 36px; border-radius: 8px; display: grid; place-items: center; flex-shrink: 0; margin-top: 2px; }
.pf-finding-copy { display: flex; flex-direction: column; align-items: flex-start; min-width: 0; flex: 1; overflow-wrap: anywhere; }
.pf-finding-meta { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 8px; }
.pf-category-tag { font-size: .75rem; line-height: 1.5; font-weight: 600; }
.pf-category-tag.missing { color: var(--ui-warning); }
.pf-category-tag.conflict { color: var(--ui-danger); }
.pf-category-tag.outdated { color: var(--ui-info); }
.pf-category-tag.question { color: var(--ui-purple); }
.pf-priority { font-size: .75rem; line-height: 1.5; color: var(--ui-danger); border-left: 1px solid var(--ui-border); padding-left: 8px; }
.pf-reviewed-label { display: inline-flex; align-items: center; gap: 4px; font-size: .75rem; color: var(--ui-accent); }
.pf-finding-copy > strong { color: var(--ui-text); font-size: .9375rem; line-height: 1.5; font-weight: 650; }
.pf-finding-description { color: var(--ui-muted); font-size: .875rem; line-height: 1.7; margin-top: 5px; }
.pf-source-count { display: flex; gap: 6px; align-items: center; margin-top: 10px; color: var(--ui-muted); font-family: var(--font-data); font-size: .6875rem; line-height: 1.5; }
.pf-finding-chevron { margin-top: 24px; color: var(--ui-muted); transition: transform .15s; }
.expanded .pf-finding-chevron { transform: rotate(90deg); }
.pf-finding-detail { margin: 0 18px 0 66px; padding: 2px 0 18px; }
.pf-evidence-list { display: grid; gap: 10px; }
.pf-evidence { background: var(--ui-surface-alt); border: 1px solid var(--ui-border); border-radius: 8px; padding: 10px 14px 14px; }
.pf-evidence button { display: flex; align-items: center; flex-wrap: wrap; gap: 7px; width: 100%; border: 0; background: none; border-radius: 4px; padding: 6px 0; color: var(--ui-accent); font-size: .75rem; line-height: 1.5; text-align: left; }
.pf-evidence button:hover { text-decoration: underline; text-underline-offset: 3px; }
.pf-evidence button > span:not(.pf-line) { min-width: 0; flex: 1 1 8rem; overflow-wrap: anywhere; }
.pf-line { font-size: .75rem; color: var(--ui-muted); white-space: nowrap; margin-left: auto; }
.pf-evidence blockquote { margin: 10px 0 0; padding-left: 12px; border-left: 2px solid var(--ui-control-border); color: var(--ui-text); font-size: .875rem; line-height: 1.7; white-space: pre-wrap; overflow-wrap: anywhere; }
.pf-next-step { padding: 18px 0 6px; }
.pf-next-step > span { color: var(--ui-text); font-size: .875rem; font-weight: 650; }
.pf-next-step p { color: var(--ui-muted); font-size: .875rem; line-height: 1.7; margin: 6px 0 12px; overflow-wrap: anywhere; }
.pf-review-action { display: flex; flex-wrap: wrap; gap: 12px; justify-content: space-between; align-items: center; border-top: 1px solid var(--ui-border); padding-top: 14px; }
.pf-review-action > span { flex: 1 1 12rem; font-size: .75rem; line-height: 1.6; color: var(--ui-muted); }
.pf-review-button { background: var(--ui-surface-alt); color: var(--ui-accent); border-color: var(--ui-control-border); }
.pf-review-button:hover { background: var(--ui-hover); }
.pf-empty { display: flex; flex-direction: column; align-items: center; padding: 44px 24px; text-align: center; border: 1px dashed var(--ui-control-border); border-radius: 12px; background: var(--ui-surface); }
.pf-empty-icon { display: grid; place-items: center; width: 60px; height: 60px; border-radius: 50%; background: var(--ui-surface-alt); color: var(--ui-accent); margin-bottom: 18px; }
.pf-empty h3 { font-size: 1.125rem; line-height: 1.4; font-weight: 600; margin: 0 0 8px; color: var(--ui-text); }
.pf-empty p { max-width: 420px; color: var(--ui-muted); font-size: .875rem; line-height: 1.7; margin: 0 0 20px; }
.pf-progress-row { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; padding: 20px 0 6px; font-size: .75rem; line-height: 1.5; color: var(--ui-muted); }
.pf-progress { flex: 1; min-width: 50px; height: 6px; border-radius: 3px; background: var(--ui-border); }
.pf-progress span { height: 100%; display: block; background: var(--ui-accent); border-radius: 3px; }
.pf-progress-row strong { font-weight: 600; color: var(--ui-text); font-variant-numeric: tabular-nums; }
.pf-scope { display: flex; align-items: flex-start; gap: 10px; border-top: 1px solid var(--ui-border); color: var(--ui-muted); margin-top: 32px; padding-top: 20px; }
.pf-scope > svg { margin-top: 3px; }
.pf-scope strong { font-size: .875rem; line-height: 1.5; color: var(--ui-text); font-weight: 600; }
.pf-scope p { font-size: .75rem; line-height: 1.7; max-width: 850px; margin: 6px 0 0; }
.pf-editor { width: min(680px, calc(100vw - 32px)); max-width: calc(100vw - 32px); max-height: calc(100dvh - 32px); overflow-y: auto; background: var(--ui-surface); border: 1px solid var(--ui-border); border-radius: 16px; padding: 28px; color: var(--ui-text); box-shadow: var(--ui-shadow); }
.pf-editor::backdrop { background: var(--ui-backdrop); }
.pf-editor-heading { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin-bottom: 24px; }
.pf-editor-heading > div { flex: 1; min-width: 0; }
.pf-editor-heading h2 { font-size: 1.5rem; line-height: 1.3; font-weight: 650; letter-spacing: -.035em; margin: 3px 0 0; overflow-wrap: anywhere; }
.pf-editor-heading .icon-button { width: 36px; flex-shrink: 0; color: var(--ui-muted); }
.pf-editor label { display: flex; flex-direction: column; gap: 8px; font-size: .875rem; line-height: 1.5; font-weight: 600; margin-bottom: 18px; min-width: 0; }
.pf-editor input, .pf-editor textarea, .pf-editor select { width: 100%; min-width: 0; min-height: 40px; padding: 11px 12px; border: 1px solid var(--ui-control-border); border-radius: 8px; background: var(--ui-surface); color: var(--ui-text); font-size: .875rem; font-weight: 400; font-family: inherit; }
.pf-editor input::placeholder, .pf-editor textarea::placeholder { color: var(--ui-muted); opacity: 1; }
.pf-editor textarea { resize: vertical; line-height: 1.7; font-family: ui-monospace, SFMono-Regular, monospace; }
.pf-editor-fields { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 16px; }
.pf-editor-hint { font-size: .75rem; line-height: 1.7; color: var(--ui-muted); }
.pf-editor-error { font-size: .875rem; line-height: 1.5; color: var(--ui-danger); }
.pf-editor-actions { display: flex; justify-content: flex-end; flex-wrap: wrap; gap: 8px; padding-top: 18px; border-top: 1px solid var(--ui-border); margin-top: 24px; }
@media (min-width: 1600px) {
  .pf-content { padding: 44px 48px 32px; }
  .pf-workbench { grid-template-columns: minmax(0, 300px) minmax(0, 1fr); gap: 28px; }
}
@media (max-width: 1200px) {
  .pf-content { padding: 28px 24px; }
  .pf-workbench { gap: 18px; grid-template-columns: minmax(0, 248px) minmax(0, 1fr); }
  .pf-metric { padding: 14px; }
  .pf-finding-summary { gap: 10px; padding: 16px; }
  .pf-finding-detail { margin: 0 16px; }
}
@media (max-width: 1080px) {
  .pf-workbench { grid-template-columns: 1fr; gap: 28px; }
  .pf-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .pf-document-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); column-gap: 20px; }
}
@media (max-width: 760px) {
  .pf-content { padding: 24px 20px; }
  .preflight-page button { min-height: 44px; }
  .pf-header h1 { font-size: 2rem; }
  .pf-header { gap: 20px; }
  .pf-header-actions { width: 100%; }
  .pf-header-actions > button { flex: 1 1 9rem; }
  .pf-context { gap: 8px; margin-bottom: 24px; }
  .pf-example-badge { margin-left: 0; }
  .pf-metrics { gap: 0; margin-bottom: 24px; }
  .pf-metric-top { margin-bottom: 12px; }
  .pf-document-list { grid-template-columns: 1fr; }
  .pf-remove { width: 44px; }
  .pf-notice { flex-wrap: wrap; }
  .pf-editor { padding: 20px; }
  .pf-editor-heading .icon-button { width: 44px; }
  .pf-editor input, .pf-editor textarea, .pf-editor select { min-height: 44px; font-size: 1rem; }
}
@media (max-width: 420px) {
  .pf-content { padding: 24px 16px; }
  .pf-header h1 { font-size: 1.75rem; }
  .pf-metric { padding: 12px; }
  .pf-metric-top strong { font-size: 1.5rem; }
  .pf-finding-summary { padding: 14px; gap: 8px; }
  .pf-finding-symbol { width: 28px; height: 28px; }
  .pf-finding-chevron { width: 12px; }
  .pf-finding-detail { margin: 0 14px; }
  .pf-review-button { width: 100%; }
  .pf-progress-row > span { width: 100%; }
  .pf-context-divider { display: none; }
  .pf-editor-fields { grid-template-columns: 1fr; gap: 0; }
  .pf-editor-actions > button { flex: 1; }
}
@media (pointer: coarse) {
  .preflight-page button { min-height: 44px; }
  .pf-remove, .pf-editor-heading .icon-button { width: 44px; }
}
</style>
