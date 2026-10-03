<script setup>
import { computed, nextTick, onUnmounted, ref, watch } from 'vue';
import AppIcon from './AppIcon.vue';
import { analyzePacket, createSamplePacket, inferDocumentVersion, PREFLIGHT_CATEGORIES, CHECK_SCOPE } from '../lib/documentPreflight.js';

const STORAGE_KEY = 'microfish.document-preflight.v1';
const MAX_DOCUMENTS = 12;
const MAX_TEXT = 100000;
const MAX_PACKET = 500000;
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
    storageNotice.value = 'The saved packet could not be loaded. The example packet is open; changes will stay available in this tab.';
    return null;
  }
}
const saved = restore();
const documents = ref(saved?.documents ?? createSamplePacket());
const isExample = ref(saved ? saved.isExample === true : true);
const hasScanned = ref(saved ? saved.hasScanned === true : true);
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
function inferKind(name) {
  if (/protocol/i.test(name)) return 'protocol';
  if (/consent/i.test(name)) return 'consent';
  if (/onboard|checklist/i.test(name)) return 'onboarding';
  if (/training|certificate/i.test(name)) return 'training';
  return 'other';
}
async function importFiles(files) {
  if (!files?.length || importing.value || running.value) return;
  importing.value = true;
  const added = [];
  const errors = [];
  const startingOwnPacket = isExample.value;
  const baseDocuments = startingOwnPacket ? [] : documents.value;
  let total = baseDocuments.reduce((sum, document) => sum + document.text.length, 0);
  for (const file of Array.from(files)) {
    if (!/\.(txt|md|markdown)$/i.test(file.name)) { errors.push(`${file.name}: use a .txt or Markdown file, or paste its text.`); continue; }
    if (baseDocuments.length + added.length >= MAX_DOCUMENTS) { errors.push(`The packet limit is ${MAX_DOCUMENTS} documents.`); break; }
    if (file.size > 1024 * 1024) { errors.push(`${file.name}: file is too large.`); continue; }
    try {
      const text = await file.text();
      if (!text.trim() || text.includes('\u0000')) { errors.push(`${file.name}: no readable text found.`); continue; }
      if (text.length > MAX_TEXT || total + text.length > MAX_PACKET) { errors.push(`${file.name}: exceeds the document or packet text limit.`); continue; }
      total += text.length;
      const version = inferDocumentVersion(text);
      added.push({ id: newId(), name: file.name, kind: inferKind(file.name), version, text });
    } catch { errors.push(`${file.name}: could not read this file.`); }
  }
  if (added.length) {
    backup();
    if (startingOwnPacket) documents.value = [];
    documents.value.push(...added);
    isExample.value = false;
    invalidate();
  }
  notice.value = [added.length ? `${added.length} document${added.length === 1 ? '' : 's'} added.${startingOwnPacket ? ' Example documents set aside.' : ''} Check each document’s type and version, then run preflight.` : '', ...errors].filter(Boolean).join(' ');
  importing.value = false;
  if (fileInput.value) fileInput.value.value = '';
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
      <div class="pf-eyebrow"><AppIcon name="document-check" :size="15" /> RESEARCH READINESS</div>
      <header class="pf-header">
        <div>
          <h1 id="preflight-heading" ref="heading" tabindex="-1">Document preflight<span>.</span></h1>
          <p>Catch the small gaps before they become big delays.</p>
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

      <div class="pf-metrics" aria-label="Filter findings by category">
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
          <input ref="fileInput" class="sr-only" type="file" accept=".txt,.md,.markdown,text/plain,text/markdown" multiple tabindex="-1" aria-label="Upload packet documents" @change="importFiles($event.target.files)" />
          <button class="pf-upload" :disabled="importing || running" @click="fileInput.click()" @dragover.prevent @drop.prevent="importFiles($event.dataTransfer.files)">
            <span class="pf-upload-icon"><AppIcon name="upload" :size="21" /></span>
            <strong>{{ importing ? 'Reading documents…' : 'Add documents' }}</strong>
            <span>Drop files here or browse</span><small>Text & Markdown · up to 12 files</small>
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
            <div><h2 id="findings-heading">A closer look</h2><p>{{ hasScanned ? `${openFindings.length} ${openFindings.length === 1 ? 'item needs' : 'items need'} your attention` : 'Check the packet to see what needs attention' }}</p></div>
            <span v-if="hasScanned" class="pf-review-badge"><AppIcon :name="openFindings.length ? 'alert' : 'check'" :size="14" />{{ openFindings.length ? 'Review needed' : results.findings.length ? 'Review complete' : 'Checks complete' }}</span>
          </div>
          <div class="pf-findings-toolbar">
            <div ref="reviewTabs" class="pf-review-tabs" aria-label="Finding status">
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
        <div class="pf-editor-heading"><div><span class="pf-eyebrow">PACKET DOCUMENT</span><h2 id="document-editor-title">{{ documents.some(document => document.id === draft.id) ? 'Edit document' : 'Add document text' }}</h2></div><button type="button" class="icon-button" aria-label="Close document editor" @click="closeEditor"><AppIcon name="close" /></button></div>
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
.preflight-page { flex: 1; min-height: 0; overflow-y: auto; background: #fafbf8; }
.pf-content { max-width: 1480px; padding: 35px 34px 24px; margin: 0 auto; }
.pf-eyebrow { display: flex; align-items: center; gap: 8px; color: #668066; font-size: 10px; font-weight: 650; letter-spacing: 1.35px; }
.pf-header { display: flex; align-items: center; justify-content: space-between; gap: 20px; margin: 13px 0 20px; }
.pf-header h1 { font-size: clamp(25px, 2.55vw, 36px); line-height: 1.2; font-weight: 570; letter-spacing: -1.25px; margin: 0 0 10px; color: #264b39; }
.pf-header h1 span { color: #98aa7e; }
.pf-header h1:focus { outline: none; }
.pf-header p { color: #71806f; font-size: 12px; line-height: 1.6; margin: 0; }
.pf-header-actions { display: flex; gap: 9px; flex-shrink: 0; }
.pf-button { display: inline-flex; align-items: center; justify-content: center; gap: 7px; border-radius: 7px; padding: 11px 14px; font-size: 11px; line-height: 1.25; font-weight: 550; white-space: nowrap; border: 1px solid transparent; }
.pf-button:disabled { opacity: .45; }
.pf-primary { color: #fff; background: #2f684d; border-color: #2f684d; box-shadow: 0 2px 3px #234d3a0c; }
.pf-primary:hover:not(:disabled) { background: #25583f; }
.pf-secondary { background: #fff; border-color: #dce3d6; color: #506149; }
.pf-secondary:hover:not(:disabled) { background: #f0f4eb; }
.pf-context { display: flex; align-items: center; flex-wrap: wrap; gap: 11px; font-size: 10px; color: #778171; margin-bottom: 26px; }
.pf-packet-label { display: inline-flex; gap: 7px; align-items: center; font-weight: 550; color: #51654b; }
.pf-green-dot { width: 6px; height: 6px; border-radius: 50%; background: #7c976a; }
.pf-context-divider { color: #b1b9aa; }
.pf-example-badge { margin-left: auto; padding: 4px 7px; background: #f0f3e9; border: 1px solid #e5e9dc; border-radius: 4px; color: #718063; font-size: 9px; }
.pf-notice { display: flex; gap: 10px; align-items: center; background: #eef4e8; border: 1px solid #d5e2cd; border-radius: 8px; padding: 11px 13px; margin-bottom: 17px; font-size: 11px; line-height: 1.6; }
.pf-notice > span { flex: 1; }
.pf-text-button { padding: 4px 0; background: none; border: 0; color: #326047; text-decoration: underline; font-size: 11px; white-space: nowrap; }
.pf-metrics { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 13px; margin-bottom: 27px; }
.pf-metric { border: 1px solid #e0e6d9; border-radius: 9px; background: #fff; padding: 15px 16px 13px; text-align: left; transition: border-color .15s, background .15s; }
.pf-metric:hover { border-color: #a8ba99; background: #fcfdf9; }
.pf-metric.selected { border-color: #72966b; box-shadow: 0 0 0 1px #72966b; }
.pf-metric-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.pf-metric-icon { height: 33px; width: 33px; border-radius: 8px; display: grid; place-items: center; }
.missing .pf-metric-icon, .pf-finding-symbol.missing { color: #927340; background: #f6f0e0; }
.conflict .pf-metric-icon, .pf-finding-symbol.conflict { color: #a56953; background: #f8ebe4; }
.outdated .pf-metric-icon, .pf-finding-symbol.outdated { color: #697d92; background: #eaf0f4; }
.question .pf-metric-icon, .pf-finding-symbol.question { color: #7e7495; background: #f0edf5; }
.pf-metric-top strong { font-size: 28px; font-weight: 530; line-height: 1; letter-spacing: -.8px; color: #35513d; }
.pf-metric-label { display: block; font-size: 11px; font-weight: 580; color: #445740; margin-bottom: 9px; line-height: 1.45; }
.pf-metric-link { display: flex; justify-content: space-between; align-items: center; color: #86917e; font-size: 9px; }
.pf-workbench { display: grid; grid-template-columns: 255px minmax(0, 1fr); gap: 23px; align-items: start; }
.pf-packet-panel { border: 1px solid #e1e7db; background: #f5f7f0; border-radius: 9px; padding: 18px 14px 13px; }
.pf-panel-heading { display: flex; align-items: center; justify-content: space-between; padding: 0 3px; }
.pf-panel-heading h2, .pf-findings-heading h2 { margin: 0; font-size: 15px; font-weight: 580; letter-spacing: -.25px; color: #38523d; }
.pf-count { display: grid; place-items: center; width: 22px; height: 20px; border-radius: 5px; background: #e8eee0; color: #647858; font-size: 10px; }
.pf-panel-description { margin: 9px 3px 19px; font-size: 10px; line-height: 1.7; color: #7b8673; }
.pf-upload { display: flex; flex-direction: column; align-items: center; width: 100%; background: #fcfdf9; border: 1px dashed #bccdaf; border-radius: 7px; padding: 18px 8px 16px; color: #647957; }
.pf-upload:hover { background: #edf4e6; }
.pf-upload-icon { margin-bottom: 10px; }
.pf-upload strong { font-size: 11px; font-weight: 580; }
.pf-upload > span:not(.pf-upload-icon) { font-size: 10px; margin-top: 5px; }
.pf-upload small { font-size: 8px; color: #929a8a; margin-top: 10px; }
.pf-paste-button { display: flex; align-items: center; justify-content: center; gap: 5px; width: 100%; padding: 10px 4px; color: #69805e; background: none; border: 0; font-size: 10px; }
.pf-paste-button:hover { color: #2f6043; }
.pf-document-list { margin: 9px -3px 0; }
.pf-document { display: flex; align-items: center; gap: 3px; border-bottom: 1px solid #e5eadf; padding: 9px 2px; }
.pf-document-open { display: flex; align-items: center; gap: 10px; min-width: 0; flex: 1; text-align: left; padding: 4px 0; border: 0; background: none; }
.pf-document-open:hover strong { color: #2e724e; }
.pf-file-icon { height: 33px; width: 28px; background: #fff; border: 1px solid #e1e7d9; border-radius: 5px; display: grid; place-items: center; color: #89997c; flex-shrink: 0; }
.pf-document-text { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
.pf-document-text strong { font-weight: 550; color: #52644a; font-size: 10px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pf-document-text > span { color: #89917f; font-size: 9px; }
.pf-remove { border: 0; background: none; padding: 6px; color: #8d9883; border-radius: 4px; }
.pf-remove:hover { background: #e7ecdf; color: #8a5145; }
.pf-packet-footer { display: flex; align-items: center; gap: 6px; color: #8b9581; font-size: 9px; padding: 17px 3px 7px; }
.pf-example-button { display: flex; align-items: center; gap: 6px; padding: 6px 3px; border: 0; background: none; color: #63805a; font-size: 9px; }
.pf-empty-packet { font-size: 11px; color: #7b8673; padding: 12px 5px; line-height: 1.6; }
.pf-findings-panel { min-width: 0; }
.pf-findings-heading { display: flex; gap: 12px; justify-content: space-between; align-items: center; padding: 2px 0 17px; }
.pf-findings-heading p { color: #86907e; font-size: 10px; margin: 7px 0 0; }
.pf-review-badge { display: flex; gap: 5px; align-items: center; padding: 5px 7px; border: 1px solid #eadfc7; border-radius: 5px; background: #faf5e9; color: #927643; font-size: 9px; white-space: nowrap; }
.pf-findings-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 8px; border-bottom: 1px solid #e1e7d8; margin-bottom: 13px; }
.pf-review-tabs { display: flex; gap: 17px; }
.pf-review-tabs button { display: flex; align-items: center; gap: 6px; padding: 9px 0 12px; border: 0; border-bottom: 2px solid transparent; background: none; color: #86917e; font-size: 10px; }
.pf-review-tabs button.active { color: #436540; border-bottom-color: #547b45; font-weight: 600; }
.pf-review-tabs span { display: grid; place-items: center; border-radius: 4px; background: #edf1e6; color: #76876a; min-width: 18px; height: 16px; font-size: 9px; }
.pf-filter-reset { display: flex; align-items: center; gap: 5px; background: none; border: 0; padding: 5px 0; font-size: 9px; color: #7e8b74; text-align: right; }
.pf-filter-reset:disabled { cursor: default; }
.pf-findings-list { display: grid; gap: 10px; }
.pf-finding { border: 1px solid #e1e7d9; background: #fff; border-radius: 8px; overflow: hidden; }
.pf-finding:hover, .pf-finding.expanded { border-color: #b8c9a9; }
.pf-finding-summary { display: flex; align-items: flex-start; gap: 13px; width: 100%; padding: 16px; background: none; border: 0; text-align: left; }
.pf-finding-symbol { height: 31px; width: 31px; border-radius: 7px; display: grid; place-items: center; flex-shrink: 0; margin-top: 2px; }
.pf-finding-copy { display: flex; flex-direction: column; align-items: flex-start; min-width: 0; flex: 1; }
.pf-finding-meta { display: flex; align-items: center; flex-wrap: wrap; gap: 9px; margin-bottom: 8px; }
.pf-category-tag { font-size: 8px; font-weight: 600; }
.pf-category-tag.missing { color: #9a7c46; }.pf-category-tag.conflict { color: #a8705c; }.pf-category-tag.outdated { color: #6e8097; }.pf-category-tag.question { color: #887a9c; }
.pf-priority { font-size: 8px; color: #ab806b; border-left: 1px solid #e8e8df; padding-left: 9px; }
.pf-reviewed-label { display: inline-flex; align-items: center; gap: 2px; font-size: 8px; color: #557e50; }
.pf-finding-copy > strong { color: #3e543d; font-size: 12px; line-height: 1.6; font-weight: 580; }
.pf-finding-description { color: #828d7a; font-size: 10px; line-height: 1.8; margin-top: 3px; }
.pf-source-count { display: flex; gap: 5px; align-items: center; margin-top: 10px; color: #8b987f; font-size: 9px; }
.pf-finding-chevron { margin-top: 21px; color: #8b9b7a; transition: transform .15s; }
.expanded .pf-finding-chevron { transform: rotate(90deg); }
.pf-finding-detail { margin: 0 16px 0 60px; padding: 2px 0 15px; }
.pf-evidence-list { display: grid; gap: 8px; }
.pf-evidence { background: #f7f9f3; border: 1px solid #e5ebdc; border-radius: 5px; padding: 10px 11px; }
.pf-evidence button { display: flex; align-items: center; gap: 6px; max-width: 100%; border: 0; background: none; padding: 0; color: #6f8463; font-size: 9px; text-align: left; }
.pf-evidence button > span:not(.pf-line) { min-width: 0; overflow-wrap: anywhere; }
.pf-line { font-size: 8px; color: #96a08a; white-space: nowrap; margin-left: auto; }
.pf-evidence blockquote { margin: 8px 0 0; padding-left: 9px; border-left: 2px solid #c3d2b6; color: #64735b; font-size: 10px; line-height: 1.8; white-space: pre-wrap; overflow-wrap: anywhere; }
.pf-next-step { padding: 14px 0 4px; }
.pf-next-step > span { color: #537247; font-size: 9px; font-weight: 650; }
.pf-next-step p { color: #7c8873; font-size: 10px; line-height: 1.8; margin: 5px 0 10px; }
.pf-review-action { display: flex; gap: 14px; justify-content: space-between; align-items: center; border-top: 1px solid #eef0e8; padding-top: 12px; }
.pf-review-action > span { font-size: 8px; line-height: 1.7; color: #909985; max-width: 230px; }
.pf-review-button { background: #eef4e8; color: #557849; border-color: #dbe5d0; padding: 8px 10px; font-size: 9px; }
.pf-review-button:hover { background: #e3edd9; }
.pf-empty { display: flex; flex-direction: column; align-items: center; padding: 47px 25px; text-align: center; border: 1px dashed #dae3cf; border-radius: 8px; background: #fdfefb; }
.pf-empty-icon { display: grid; place-items: center; width: 61px; height: 61px; border-radius: 50%; background: #eef3e7; color: #839c6d; margin-bottom: 15px; }
.pf-empty h3 { font-size: 15px; font-weight: 550; margin: 0 0 8px; color: #4d6842; }
.pf-empty p { max-width: 380px; color: #819075; font-size: 11px; line-height: 1.9; margin-bottom: 19px; }
.pf-progress-row { display: flex; align-items: center; gap: 13px; padding: 19px 2px 6px; font-size: 9px; color: #8b987e; }
.pf-progress { flex: 1; height: 4px; border-radius: 2px; background: #e9efdf; }
.pf-progress span { height: 100%; display: block; background: #8ba873; border-radius: 2px; }
.pf-progress-row strong { font-weight: 500; color: #718961; }
.pf-scope { display: flex; gap: 9px; border-top: 1px solid #e5ebdd; color: #8b9980; margin-top: 30px; padding-top: 19px; }
.pf-scope strong { font-size: 10px; color: #718566; font-weight: 550; }
.pf-scope p { font-size: 9px; line-height: 1.85; max-width: 850px; margin: 5px 0 0; }
.pf-editor { width: min(650px, calc(100vw - 28px)); max-height: calc(100dvh - 40px); overflow-y: auto; background: #fafcf7; border: 1px solid #d3dfc9; border-radius: 12px; padding: 26px; color: #405838; box-shadow: 0 25px 100px #20361e33; }
.pf-editor::backdrop { background: #1a302650; backdrop-filter: blur(3px); }
.pf-editor-heading { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; }
.pf-editor-heading h2 { font-size: 23px; font-weight: 550; letter-spacing: -.7px; margin: 9px 0 0; }
.pf-editor label { display: flex; flex-direction: column; gap: 8px; font-size: 11px; font-weight: 550; margin-bottom: 16px; }
.pf-editor input, .pf-editor textarea, .pf-editor select { width: 100%; min-width: 0; padding: 11px; border: 1px solid #d9e2d0; border-radius: 6px; background: #fff; color: #485c40; font-size: 12px; font-weight: 400; font-family: inherit; }
.pf-editor select:focus-visible { outline: 2px solid #4b8c6e; outline-offset: 3px; }
.pf-editor textarea { resize: vertical; line-height: 1.7; font-family: ui-monospace, SFMono-Regular, monospace; font-size: 11px; }
.pf-editor-fields { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; }
.pf-editor-hint { font-size: 10px; line-height: 1.8; color: #859279; }
.pf-editor-error { font-size: 11px; color: #a25442; }
.pf-editor-actions { display: flex; justify-content: flex-end; gap: 8px; padding-top: 14px; border-top: 1px solid #e2e9d9; margin-top: 20px; }
@media (min-width: 1600px) { .pf-content { padding: 44px 48px 30px; }.pf-workbench { grid-template-columns: 285px minmax(0, 1fr); gap: 28px; }.pf-header h1 { font-size: 38px; } }
@media (max-width: 1160px) { .pf-content { padding: 27px 23px; }.pf-header { flex-wrap: wrap; }.pf-header-actions { margin-top: 1px; }.pf-workbench { grid-template-columns: 225px minmax(0, 1fr); gap: 16px; }.pf-metric { padding: 13px; }.pf-metric-label { font-size: 10px; }.pf-finding-summary { gap: 9px; padding: 13px; }.pf-finding-detail { margin-left: 13px; margin-right: 13px; }.pf-findings-heading { align-items: flex-start; }.pf-review-badge { font-size: 8px; padding: 5px; } }
@media (max-width: 960px) and (min-width: 761px) { .pf-workbench { grid-template-columns: 1fr; }.pf-packet-panel { display: grid; grid-template-columns: 200px 1fr; column-gap: 20px; }.pf-panel-heading, .pf-panel-description, .pf-upload, .pf-paste-button { grid-column: 1; }.pf-document-list { grid-column: 2; grid-row: 1 / 6; }.pf-example-button { grid-column: 2; grid-row: 6; }.pf-packet-footer { grid-column: 1; grid-row: 6; }.pf-metrics { gap: 8px; } }
@media (max-width: 760px) { .pf-content { padding: 25px 19px; }.pf-header h1 { font-size: 31px; }.pf-header p { font-size: 11px; }.pf-header { gap: 18px; }.pf-header-actions { width: 100%; }.pf-header-actions .pf-primary { flex: 1; }.pf-context { gap: 8px; font-size: 9px; }.pf-example-badge { margin-left: 0; }.pf-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-bottom: 20px; }.pf-metric-label { font-size: 11px; }.pf-metric-top { margin-bottom: 11px; }.pf-metric-top strong { font-size: 27px; }.pf-workbench { grid-template-columns: 1fr; gap: 24px; }.pf-upload { padding: 14px; }.pf-upload-icon { margin-bottom: 7px; }.pf-document-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); column-gap: 10px; }.pf-document-open { gap: 6px; }.pf-document-text strong { font-size: 9px; }.pf-document-text > span { font-size: 8px; }.pf-file-icon { width: 25px; }.pf-document { padding: 6px 0; }.pf-packet-footer { padding-top: 13px; }.pf-finding-copy > strong { font-size: 12px; }.pf-finding-description { font-size: 11px; }.pf-finding-detail { margin: 0 13px; }.pf-evidence blockquote { font-size: 11px; }.pf-next-step p { font-size: 11px; }.pf-scope p { font-size: 10px; }.pf-findings-heading h2 { font-size: 17px; }.pf-editor { padding: 20px; }.pf-notice { flex-wrap: wrap; } }
@media (max-width: 380px) { .pf-content { padding: 22px 13px; }.pf-document-list { grid-template-columns: 1fr; }.pf-review-action { flex-wrap: wrap; }.pf-finding-summary { gap: 8px; }.pf-finding-symbol { width: 27px; height: 27px; }.pf-filter-reset { max-width: 120px; }.pf-review-tabs { gap: 11px; }.pf-progress-row { gap: 8px; }.pf-context-divider { display: none; } }
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { transition: none !important; } }
</style>
