<script setup>
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import { IMPORT_LIMITS, SIMULATION_IMPORT_ACCEPT, importSimulationFile, validateSimulationContext } from '../lib/simulationImports.js'
import { createVoiceDictation } from '../lib/voiceDictation.js'
import { AGENT_MIN, AGENT_MAX, AGENT_STEP, AGENT_BATCH_SIZE } from '../../../shared/reviewAgents.js'
import ProviderDictation from './ProviderDictation.vue'
import UniversityIRBPanel from './UniversityIRBPanel.vue'
import { isInstitutionSnapshotFresh } from '../lib/institutionProfile.js'

const props = defineProps({
  open: Boolean, university: { type: Object, default: null }, personal: Boolean, aiReady: Boolean,
  lookupReady: Boolean, institutionSnapshot: { type: Object, default: null },
  initialContext: { type: Object, default: null }, initialTitle: { type: String, default: '' },
  initialQuestion: { type: String, default: '' }, busy: Boolean, error: { type: String, default: '' },
})
const emit = defineEmits(['close', 'submit'])
const dialog = ref(null)
const titleInput = ref(null)
const fileInput = ref(null)
const transcriptInput = ref(null)
const title = ref('')
const question = ref('')
const agentCount = ref(AGENT_MIN)
const overview = ref('')
const transcript = ref('')
const documents = ref([])
const institution = ref(null)
const institutionToken = ref('')
const importing = ref(false)
const importError = ref('')
const localError = ref('')
const lookupState = ref('idle')
const lookupError = ref('')
const lookupProvider = ref('')
const voiceState = ref('idle')
const voiceError = ref('')
const interim = ref('')
const voiceSupported = ref(false)
const providerBusy = ref(false)
const activeTab = ref('files')
const dragging = ref(false)
let voice = null
let request = null
let generation = 0
let previousFocus = null

const dictating = computed(() => ['recording', 'starting', 'reconnecting', 'stopping'].includes(voiceState.value))
const transcriptOverLimit = computed(() => transcript.value.length > IMPORT_LIMITS.transcriptChars)
const context = computed(() => ({
  overview: overview.value, transcript: transcript.value,
  documents: documents.value.map(doc => ({ ...doc })),
  university: props.personal && props.university ? { id: props.university.id, name: props.university.name } : null,
  institution: props.personal ? institution.value : null,
  institutionToken: props.personal ? institutionToken.value : '',
  ...(props.personal ? { agentCount: agentCount.value } : {}),
}))
const contextError = computed(() => validateSimulationContext(context.value))
const characterCount = computed(() => overview.value.length + transcript.value.length + documents.value.reduce((sum, doc) => sum + doc.text.length, 0))
const hasContext = computed(() => Boolean(overview.value.trim() || transcript.value.trim() || documents.value.length))
const canSubmit = computed(() => !props.busy && !importing.value && !dictating.value && !providerBusy.value && lookupState.value !== 'loading' && !contextError.value && (hasContext.value || question.value.trim()))

function makeVoice() {
  voice?.destroy()
  voice = createVoiceDictation({
    onState: state => { voiceState.value = state },
    onInterim: text => { interim.value = text },
    onError: message => { voiceError.value = message },
    onText: text => {
      // Preserve the entire final segment even when it reaches the limit; never silently truncate speech.
      transcript.value += `${transcript.value && !/\s$/.test(transcript.value) ? ' ' : ''}${text}`
      if (transcript.value.length >= IMPORT_LIMITS.transcriptChars) {
        voice?.stop()
        voiceError.value = 'The transcript reached 40,000 characters. Recording has stopped; edit the preserved text before creating your simulation.'
      }
    },
  })
  voiceSupported.value = voice.supported
}
function record() {
  if (transcriptOverLimit.value || props.busy || providerBusy.value) return
  voiceError.value = ''
  voice?.start()
}
function close() {
  if (props.busy) return
  emit('close')
}
function cleanup() {
  generation++
  request?.abort()
  request = null
  voice?.destroy()
  voice = null
  providerBusy.value = false
  interim.value = ''
  importing.value = false
}
function fallbackProfile() {
  return {
    status: 'composite', university: props.university ? { id: props.university.id, name: props.university.name } : null,
    summary: 'Generic composite IRB perspectives. University membership and policies have not been verified.',
    reviewers: [], sources: [], retrievedAt: null,
  }
}
function restoreInstitutionSnapshot() {
  const saved = props.initialContext
  if (props.personal && isInstitutionSnapshotFresh({ profile: saved?.institution, token: saved?.institutionToken }, props.university, { requireToken: props.lookupReady })) {
    request?.abort()
    request = null
    institution.value = JSON.parse(JSON.stringify(saved.institution))
    institutionToken.value = saved.institutionToken || ''
    lookupState.value = 'ready'
    lookupError.value = ''
    lookupProvider.value = saved.institution.lookupMode === 'public-sources' ? 'official-sources' : ''
    return true
  }
  const shared = props.institutionSnapshot
  if (props.personal && shared?.university?.id === props.university?.id && shared.university.name === props.university?.name) {
    if (isInstitutionSnapshotFresh(shared, props.university, { requireToken: props.lookupReady })) {
      request?.abort()
      request = null
      institution.value = JSON.parse(JSON.stringify(shared.profile))
      institutionToken.value = shared.token || ''
      lookupState.value = 'ready'
      lookupError.value = ''
      lookupProvider.value = shared.provider || ''
      return true
    }
    if (shared.state === 'loading') {
      request?.abort()
      request = null
      institution.value = null
      institutionToken.value = ''
      lookupState.value = 'loading'
      lookupError.value = ''
      lookupProvider.value = ''
      return true
    }
    if (shared.state === 'fallback') {
      request?.abort()
      request = null
      institution.value = fallbackProfile()
      institutionToken.value = ''
      lookupState.value = 'fallback'
      lookupProvider.value = ''
      lookupError.value = `${shared.error} Retry the lookup, or continue with clearly labeled composite reviewers.`
      return true
    }
  }
  return false
}
async function loadInstitution() {
  request?.abort()
  request = null
  lookupProvider.value = ''
  institutionToken.value = ''
  if (!props.personal || !props.university || props.university.id === 'independent') {
    institution.value = null
    lookupState.value = 'idle'
    return
  }
  institution.value = null
  lookupState.value = 'loading'
  lookupError.value = ''
  const current = generation
  const controller = new AbortController()
  request = controller
  const timeout = setTimeout(() => controller.abort(), 150000)
  try {
    const response = await fetch(props.lookupReady ? '/api/institution' : '/api/institution-preview', {
      method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ university: { id: props.university.id, name: props.university.name } }), signal: controller.signal,
    })
    const result = await response.json()
    if (!response.ok || !result.profile) throw new Error(result.error || 'Institution information could not be retrieved.')
    if (current !== generation || !props.open || request !== controller) return
    institution.value = result.profile
    institutionToken.value = typeof result.token === 'string' ? result.token : ''
    lookupProvider.value = result.provider || 'official-sources'
    lookupState.value = 'ready'
  } catch (error) {
    if (current !== generation || !props.open || request !== controller) return
    institution.value = fallbackProfile()
    lookupState.value = 'fallback'
    lookupError.value = error.name === 'AbortError' ? 'The institution lookup timed out. You can continue with generic composite reviewers or retry.' : `${error.message} You can continue with generic composite reviewers or retry.`
  } finally { clearTimeout(timeout) }
}
async function addFiles(fileList) {
  if (importing.value || props.busy) return
  const files = Array.from(fileList || [])
  if (!files.length) return
  if (files.length > IMPORT_LIMITS.documents) { importError.value = 'Choose up to 12 files at a time.'; return }
  const current = generation
  importing.value = true
  importError.value = ''
  const errors = []
  try {
    for (const file of files) {
      if (current !== generation) return
      try {
        if (documents.value.length >= IMPORT_LIMITS.documents) throw new Error('This simulation already has 12 documents. Remove one before importing more.')
        const added = await importSimulationFile(file)
        if (current !== generation) return
        const candidates = [...documents.value, ...added]
        const issue = validateSimulationContext({ ...context.value, documents: candidates })
        if (issue) throw new Error(issue)
        documents.value = candidates
      } catch (error) { errors.push(`${file.name}: ${error.message || 'This file could not be imported.'}`) }
    }
    if (current === generation) importError.value = errors.join('\n')
  } finally {
    if (current === generation) importing.value = false
    if (fileInput.value) fileInput.value.value = ''
  }
}
function appendProviderText(text) {
  transcript.value += `${transcript.value && !transcript.value.endsWith('\n') ? '\n' : ''}${text}`
}
function switchTab(event) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
  event.preventDefault()
  activeTab.value = event.key === 'Home' ? 'files' : event.key === 'End' ? 'voice' : activeTab.value === 'files' ? 'voice' : 'files'
  document.getElementById(`setup-${activeTab.value}-tab`)?.focus()
}
function drop(event) {
  dragging.value = false
  addFiles(event.dataTransfer?.files)
}
function submit() {
  localError.value = ''
  if (contextError.value) { localError.value = contextError.value; return }
  if (!canSubmit.value) { localError.value = 'Add your study context or a research question before creating a simulation.'; return }
  if (title.value.length > 80 || question.value.length > 2000) { localError.value = 'Use up to 80 characters for the title and 2,000 for the research question.'; return }
  emit('submit', {
    title: title.value.trim(),
    question: question.value.trim() || 'Review this proposed study from the IRB perspectives provided. Identify ethical concerns, missing information, and practical next steps, using the supplied study context and institutional sources.',
    context: context.value,
  })
}
watch(() => props.open, async opened => {
  if (!opened) {
    cleanup()
    dialog.value?.close()
    if (previousFocus?.isConnected) previousFocus.focus()
    return
  }
  generation++
  previousFocus = document.activeElement
  title.value = props.initialTitle || ''
  question.value = props.initialQuestion || ''
  agentCount.value = props.initialContext?.agentCount || AGENT_MIN
  overview.value = props.initialContext?.overview || ''
  transcript.value = props.initialContext?.transcript || ''
  documents.value = (props.initialContext?.documents || []).map(doc => ({ ...doc }))
  institution.value = null
  institutionToken.value = ''
  voiceState.value = 'idle'
  voiceError.value = ''
  importError.value = ''
  localError.value = ''
  lookupError.value = ''
  activeTab.value = 'files'
  lookupProvider.value = ''
  makeVoice()
  await nextTick()
  if (!props.open) return
  if (!dialog.value?.open) dialog.value?.showModal()
  titleInput.value?.focus()
  if (!restoreInstitutionSnapshot()) loadInstitution()
}, { immediate: true })
watch(() => [props.university?.id, props.university?.name, props.personal, props.lookupReady, props.institutionSnapshot], () => { if (props.open && !restoreInstitutionSnapshot()) loadInstitution() })
onUnmounted(cleanup)
</script>

<template>
  <Teleport to="body">
    <dialog ref="dialog" class="new-simulation-dialog" aria-labelledby="new-simulation-heading" @cancel.prevent="close" @click="event => { if (event.target === dialog) close() }">
      <form class="simulation-setup" @submit.prevent="submit" :aria-busy="busy">
        <header class="setup-header">
          <div><span class="setup-eyebrow">Your next research question</span><h2 id="new-simulation-heading">{{ initialContext ? 'Review simulation setup' : 'New simulation' }}</h2><p>Bring the context. Explore the possibilities.</p></div>
          <button class="setup-close" type="button" aria-label="Close new simulation" :disabled="busy" @click="close">×</button>
        </header>
        <div class="setup-content">
          <div class="setup-field"><label for="simulation-title">Study title <span>Optional</span></label><input id="simulation-title" ref="titleInput" v-model="title" maxlength="80" placeholder="e.g. Remote monitoring pilot" :disabled="busy" /></div>
          <div class="setup-field"><label for="simulation-overview">Describe your study <span>Optional</span></label><textarea id="simulation-overview" v-model="overview" rows="3" placeholder="What are you studying? Who will participate, and what do you want to explore?" :disabled="busy" /><small :class="{ 'setup-invalid': overview.length > IMPORT_LIMITS.overviewChars }">{{ overview.length.toLocaleString() }} / 10,000 characters</small></div>

          <div v-if="personal" class="setup-field setup-agents">
            <label for="simulation-agents">Simulation agents <output for="simulation-agents">{{ agentCount }} agents</output></label>
            <input id="simulation-agents" v-model.number="agentCount" type="range" :min="AGENT_MIN" :max="AGENT_MAX" :step="AGENT_STEP" :disabled="busy" aria-describedby="simulation-agents-note" />
            <div class="setup-agent-range"><span>{{ AGENT_MIN }}</span><span>{{ AGENT_MAX }}</span></div>
            <small id="simulation-agents-note">{{ agentCount / AGENT_BATCH_SIZE }} batches of fictional AI perspectives. Watch their reviews and document connections appear in the graph. Larger panels take longer and use more API credit.</small>
          </div>

          <section class="setup-materials" aria-labelledby="setup-context-heading">
            <div class="setup-section-heading"><h3 id="setup-context-heading">Add context</h3><span>Use either, or combine both</span></div>
            <div class="setup-tabs" role="tablist" aria-label="Context input method" @keydown="switchTab">
              <button id="setup-files-tab" type="button" role="tab" :aria-selected="activeTab === 'files'" :tabindex="activeTab === 'files' ? 0 : -1" aria-controls="setup-files-panel" @click="activeTab = 'files'">Import documents <span v-if="documents.length">{{ documents.length }}</span></button>
              <button id="setup-voice-tab" type="button" role="tab" :aria-selected="activeTab === 'voice'" :tabindex="activeTab === 'voice' ? 0 : -1" aria-controls="setup-voice-panel" @click="activeTab = 'voice'">Voice dictation <span v-if="dictating || providerBusy" class="recording-dot" aria-label="Dictation in progress"></span></button>
            </div>
            <div v-show="activeTab === 'files'" id="setup-files-panel" role="tabpanel" aria-labelledby="setup-files-tab">
              <div class="setup-dropzone" :class="{ dragging }" @dragover.prevent="dragging = true" @dragleave.prevent="dragging = false" @drop.prevent="drop">
                <svg width="27" height="27" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M12 16V3m-4 4 4-4 4 4M4 14v6h16v-6"/></svg>
                <strong>{{ importing ? 'Reading your documents…' : 'Drop your study materials here' }}</strong>
                <p>PDF, Markdown, text, or ZIP · up to 15 MB each</p>
                <button type="button" class="setup-secondary" :disabled="busy || importing" @click="fileInput?.click()">{{ importing ? 'Importing…' : 'Choose files' }}</button>
                <input ref="fileInput" class="sr-only" type="file" multiple :accept="SIMULATION_IMPORT_ACCEPT" tabindex="-1" aria-label="Import study documents" @change="addFiles($event.target.files)" />
              </div>
              <p class="setup-note">Up to 12 documents and 40,000 characters each. ZIP files may contain PDFs, Markdown, and text. Scanned PDFs need OCR first.</p>
              <p v-if="importError" class="setup-error" role="alert">{{ importError }}</p>
              <div v-if="documents.length" class="setup-documents">
                <details v-for="doc in documents" :key="doc.id" class="setup-document">
                  <summary><span><strong>{{ doc.name }}</strong><small>{{ doc.kind }} · {{ doc.text.length.toLocaleString() }} characters</small></span><span aria-hidden="true">⌄</span></summary>
                  <div class="setup-document-body"><label :for="`document-${doc.id}`">Review and edit extracted text</label><textarea :id="`document-${doc.id}`" v-model="doc.text" rows="6" :disabled="busy" /><button type="button" class="setup-remove" :disabled="busy" @click="documents = documents.filter(item => item.id !== doc.id)">Remove document</button></div>
                </details>
              </div>
            </div>
            <div v-show="activeTab === 'voice'" id="setup-voice-panel" role="tabpanel" aria-labelledby="setup-voice-tab">
              <div class="setup-voice-intro"><span class="setup-microphone" :class="{ active: dictating }"><svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="9" y="2" width="6" height="13" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8"/></svg></span><div><strong>Talk through your study</strong><p>Explain your goals, participants, design, and concerns in your own words.</p></div></div>
              <p v-if="!voiceSupported" class="setup-notice" role="status">This browser does not support voice dictation. You can type or paste a transcript below, or use a browser with speech recognition.</p>
              <template v-else>
                <div class="setup-voice-controls">
                  <button v-if="!dictating" type="button" class="setup-primary" :disabled="busy || providerBusy || transcriptOverLimit" @click="record">{{ voiceState === 'paused' ? 'Resume dictation' : 'Start dictation' }}</button>
                  <button v-if="dictating && voiceState !== 'stopping'" type="button" class="setup-secondary" @click="voice?.pause()">Pause</button>
                  <button v-if="dictating || voiceState === 'paused'" type="button" class="setup-secondary" :disabled="voiceState === 'stopping'" @click="voice?.stop()">Stop</button>
                  <span class="setup-voice-status" role="status"><span v-if="dictating" class="recording-dot"></span>{{ ({ recording: 'Listening…', starting: 'Starting microphone…', reconnecting: 'Reconnecting microphone…', stopping: 'Finishing transcript…', paused: 'Paused' })[voiceState] || 'Ready when you are' }}</span>
                </div>
                <p class="setup-note">Your browser’s speech service processes your voice and may send audio to its provider. This app keeps the transcript, not an audio recording. Dictation reconnects automatically during long sessions.</p>
              </template>
              <details v-if="aiReady && voiceSupported" class="setup-provider-voice"><summary>Use OpenAI dictation instead</summary><ProviderDictation :active="open" :disabled="busy || importing || dictating" :remaining-characters="Math.max(0, 40000 - transcript.length)" @append="appendProviderText" @busy="providerBusy = $event" /></details>
              <ProviderDictation v-else-if="aiReady" :active="open" :disabled="busy || importing || dictating" :remaining-characters="Math.max(0, 40000 - transcript.length)" @append="appendProviderText" @busy="providerBusy = $event" />
              <p v-if="voiceError" class="setup-error" role="alert">{{ voiceError }}</p>
              <div class="setup-field"><label for="simulation-transcript">Transcript <span>{{ dictating ? 'Pause to edit' : 'Editable' }}</span></label><textarea id="simulation-transcript" ref="transcriptInput" v-model="transcript" :readonly="dictating" :disabled="busy" rows="6" placeholder="Your words will appear here. You can also type or paste your study context." /><small :class="{ 'setup-invalid': transcriptOverLimit }">{{ transcript.length.toLocaleString() }} / 40,000 characters</small></div>
              <p v-if="interim" class="setup-interim" aria-label="Speech being transcribed">{{ interim }}</p>
            </div>
          </section>

          <UniversityIRBPanel v-if="personal && university" :university="university" :profile="institution" :state="lookupState" :error="lookupError" :provider="lookupProvider" @refresh="loadInstitution" />
          <p v-if="personal && university?.id === 'independent'" class="setup-note">Independent research uses explicitly labeled composite IRB reviewers.</p>
          <p v-if="personal && lookupReady" class="setup-note">Online AI searches use a connected provider when needed. Direct public university sources do not require a model request.</p>

          <div class="setup-field"><label for="simulation-question">What should the simulation explore? <span>Optional</span></label><textarea id="simulation-question" v-model="question" maxlength="2000" rows="3" placeholder="e.g. What concerns could reviewers raise about consent and recruitment?" :disabled="busy" /><small>Leave blank to review ethical concerns, missing information, and next steps.</small></div>
          <p v-if="contextError || localError || error" class="setup-error" role="alert">{{ contextError || localError || error }}</p>
        </div>
        <footer class="setup-footer"><div><strong>{{ documents.length }} {{ documents.length === 1 ? 'document' : 'documents' }}<template v-if="transcript.trim()"> + transcript</template></strong><span>{{ characterCount.toLocaleString() }} / 120,000 context characters</span></div><div class="setup-footer-actions"><button type="button" class="setup-secondary" :disabled="busy" @click="close">Cancel</button><button type="submit" class="setup-primary" :disabled="!canSubmit">{{ busy ? 'Saving…' : initialContext ? 'Save setup' : 'Create simulation' }}</button></div></footer>
      </form>
    </dialog>
  </Teleport>
</template>

<style scoped>
.new-simulation-dialog { border:1px solid var(--ui-border); border-radius:20px; padding:0; width:min(760px, calc(100vw - 32px)); max-height:calc(100dvh - 48px); color:var(--ui-text); background:var(--ui-surface); box-shadow:var(--ui-dialog-shadow); }
.new-simulation-dialog::backdrop { background:var(--ui-dialog-backdrop); backdrop-filter:blur(5px); }
.simulation-setup { display:flex; flex-direction:column; max-height:calc(100dvh - 50px); margin:0; }
.setup-header { padding:26px 30px 21px; border-bottom:1px solid var(--ui-border); display:flex; justify-content:space-between; gap:20px; flex-shrink:0; }
.setup-eyebrow { color:var(--ui-accent); font-size:.68rem; text-transform:uppercase; letter-spacing:.11em; font-weight:650; }
.setup-header h2 { font-family:var(--font-display); font-size:2rem; font-weight:500; margin:7px 0; letter-spacing:-.7px; }
.setup-header p { color:var(--ui-muted); font-size:.875rem; margin:0; }
.setup-close { border:0; border-radius:50%; width:36px; height:36px; font-size:1.6rem; line-height:1; background:var(--ui-surface-alt); }
.setup-content { overflow-y:auto; padding:24px 30px; display:flex; flex-direction:column; gap:24px; min-height:0; }
.setup-field { display:flex; flex-direction:column; gap:8px; }
.setup-field label, .setup-document-body label { font-size:.82rem; font-weight:600; }
.setup-field label span { margin-left:6px; font-weight:400; color:var(--ui-muted); font-size:.74rem; }
.setup-field input, .setup-field textarea, .setup-document textarea { width:100%; border:1px solid var(--ui-border); border-radius:9px; padding:11px 13px; background:var(--ui-surface); color:var(--ui-text); font-size:.875rem; line-height:1.6; resize:vertical; min-height:43px; }
.setup-agents label { display:flex; justify-content:space-between; align-items:center; gap:12px; }
.setup-agents output { color:var(--ui-accent); font-variant-numeric:tabular-nums; }
.setup-agents input[type='range'] { padding:0; border:0; min-height:28px; accent-color:var(--ui-accent); cursor:pointer; }
.setup-agent-range { display:flex; justify-content:space-between; color:var(--ui-muted); font-size:.7rem; }
.setup-field textarea:read-only { background:var(--ui-surface-alt); }
.setup-field small { color:var(--ui-muted); font-size:.7rem; line-height:1.5; }
.setup-field .setup-invalid { color:var(--ui-danger); }
.setup-section-heading { display:flex; justify-content:space-between; gap:14px; align-items:baseline; margin-bottom:12px; }
.setup-section-heading h3 { margin:0; font-size:.9rem; font-weight:600; }
.setup-section-heading > span { font-size:.73rem; color:var(--ui-muted); text-align:right; }
.setup-tabs { display:flex; gap:4px; background:var(--ui-surface-alt); padding:4px; border-radius:9px; margin-bottom:14px; }
.setup-tabs button { flex:1; border:1px solid transparent; background:transparent; color:var(--ui-muted); border-radius:7px; font-size:.8rem; display:flex; align-items:center; justify-content:center; gap:8px; }
.setup-tabs button[aria-selected='true'] { color:var(--ui-accent); background:var(--ui-surface); border-color:var(--ui-border); box-shadow:var(--ui-tab-shadow); }
.setup-tabs button > span:not(.recording-dot) { background:var(--ui-selected); padding:1px 6px; border-radius:5px; font-size:.7rem; }
.setup-dropzone { border:1px dashed var(--ui-drop-border); background:var(--ui-surface-alt); border-radius:11px; text-align:center; padding:24px 15px; display:flex; flex-direction:column; align-items:center; color:var(--ui-accent); }
.setup-dropzone.dragging { background:var(--ui-selected); border-color:var(--ui-accent); }
.setup-dropzone strong { font-size:.86rem; font-weight:500; margin-top:12px; color:var(--ui-text); }
.setup-dropzone p { margin:7px 0 14px; color:var(--ui-muted); font-size:.74rem; }
.setup-secondary, .setup-primary { padding:8px 14px; border-radius:8px; font-size:.79rem; font-weight:550; min-height:38px; }
.setup-secondary { border:1px solid var(--ui-border); background:var(--ui-surface); color:var(--ui-text); }
.setup-primary { border:1px solid var(--ui-accent); background:var(--ui-accent); color:var(--ui-on-accent); }
.setup-secondary:hover { background:var(--ui-hover); }
.setup-primary:disabled, .setup-secondary:disabled { opacity:.5; }
.setup-note { color:var(--ui-muted); font-size:.73rem; line-height:1.65; margin:10px 0 0; }
.setup-error { color:var(--ui-danger); background:var(--ui-danger-bg); font-size:.8rem; padding:11px 13px; border-radius:8px; line-height:1.6; white-space:pre-line; margin:10px 0 0; overflow-wrap:anywhere; }
.setup-notice { background:var(--ui-warning-bg); color:var(--ui-warning); font-size:.78rem; padding:11px 13px; line-height:1.6; border-radius:8px; }
.setup-documents { display:flex; flex-direction:column; gap:8px; margin-top:16px; }
.setup-document { border:1px solid var(--ui-border); border-radius:9px; }
.setup-document summary { display:flex; justify-content:space-between; gap:10px; cursor:pointer; padding:11px 13px; list-style:none; }
.setup-document summary::-webkit-details-marker { display:none; }
.setup-document summary strong { display:block; font-size:.79rem; font-weight:500; overflow-wrap:anywhere; }
.setup-document summary small { display:block; color:var(--ui-muted); font-size:.67rem; margin-top:4px; }
.setup-document-body { padding:0 13px 12px; display:flex; flex-direction:column; gap:8px; }
.setup-remove { align-self:flex-start; border:0; background:transparent; color:var(--ui-danger); font-size:.74rem; padding:0; }
.setup-voice-intro { display:flex; gap:13px; align-items:center; margin:19px 0; }
.setup-microphone { background:var(--ui-selected); color:var(--ui-accent); display:grid; place-items:center; border-radius:50%; width:47px; height:47px; flex-shrink:0; }
.setup-microphone.active { background:var(--ui-danger-bg); color:var(--ui-danger); }
.setup-voice-intro strong { font-size:.86rem; }
.setup-voice-intro p { font-size:.75rem; color:var(--ui-muted); margin:5px 0 0; line-height:1.5; }
.setup-voice-controls { display:flex; align-items:center; gap:9px; flex-wrap:wrap; }
.setup-voice-status { display:flex; align-items:center; gap:7px; color:var(--ui-muted); font-size:.73rem; }
.recording-dot { width:7px; height:7px; display:inline-block; background:var(--ui-recording); border-radius:50%; }
#setup-voice-panel > .setup-field { margin-top:17px; }
.setup-interim { font-size:.79rem; font-style:italic; line-height:1.5; color:var(--ui-muted); padding:8px 12px; border-left:2px solid var(--ui-accent); margin:10px 0 0; }
.setup-institution { border-top:1px solid var(--ui-border); border-bottom:1px solid var(--ui-border); padding:18px 0; }
.setup-lookup { font-size:.78rem; display:flex; align-items:center; gap:9px; color:var(--ui-muted); line-height:1.5; }
.setup-spinner { width:15px; height:15px; border:2px solid var(--ui-border); border-top-color:var(--ui-accent); border-radius:50%; flex-shrink:0; animation:setup-spin 1s linear infinite; }
.setup-reviewers { display:grid; grid-template-columns:1fr 1fr; gap:9px; margin-top:14px; }
.setup-reviewers article { padding:12px; background:var(--ui-surface-alt); border-radius:9px; }
.setup-reviewers strong { display:block; font-size:.79rem; }
.setup-reviewers span { display:block; color:var(--ui-accent); font-size:.7rem; margin-top:4px; }
.setup-reviewers p { font-size:.73rem; line-height:1.5; margin:7px 0; color:var(--ui-muted); }
.setup-reviewers small { font-size:.65rem; color:var(--ui-muted); }
.setup-provider-voice { margin-top:14px; font-size:.78rem; }
.setup-provider-voice > summary { cursor:pointer; color:var(--ui-accent); margin-bottom:10px; }
.setup-sources { font-size:.76rem; margin-top:12px; }
.setup-sources summary { cursor:pointer; font-weight:500; }
.setup-sources ul { padding-left:18px; line-height:1.8; overflow-wrap:anywhere; }
.setup-sources a, .setup-inline-button { color:var(--ui-accent); }
.setup-inline-button { border:0; background:transparent; text-decoration:underline; padding:0; min-height:28px; }
.setup-footer { padding:16px 30px; border-top:1px solid var(--ui-border); display:flex; align-items:center; justify-content:space-between; gap:16px; flex-shrink:0; background:var(--ui-surface); }
.setup-footer > div:first-child { display:flex; flex-direction:column; gap:4px; }
.setup-footer strong { font-size:.73rem; font-weight:500; }
.setup-footer span { font-size:.65rem; color:var(--ui-muted); }
.setup-footer-actions { display:flex; gap:8px; }
@keyframes setup-spin { to { transform:rotate(360deg); } }
@media (prefers-reduced-motion:reduce) { .setup-spinner { animation:none; } }
@media (max-width:560px) {
  .new-simulation-dialog { width:calc(100vw - 16px); max-height:calc(100dvh - 16px); border-radius:14px; }
  .simulation-setup { max-height:calc(100dvh - 18px); }
  .setup-header { padding:20px 18px 16px; }
  .setup-header h2 { font-size:1.7rem; }
  .setup-content { padding:20px 18px; gap:21px; }
  .setup-footer { padding:12px 18px; flex-wrap:wrap; gap:11px; }
  .setup-footer-actions { margin-left:auto; }
  .setup-reviewers { grid-template-columns:1fr; }
  .setup-section-heading { flex-wrap:wrap; gap:6px; }
  .setup-section-heading > span { text-align:left; }
}
</style>
