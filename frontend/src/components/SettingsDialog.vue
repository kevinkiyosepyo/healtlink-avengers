<script setup>
import { ref, watch } from "vue";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog";
import StatusBadge from "./StatusBadge.vue";

const open = defineModel("open", { type: Boolean, default: false });
const props = defineProps({
  research: { type: Object, required: true },
  // useResearcherAccount(): Google sign-in state and actions.
  account: { type: Object, required: true },
});

const confirmDelete = ref(false);
const showKey = ref(false);
watch(open, (value) => {
  if (!value) confirmDelete.value = false;
});

const keyBadge = {
  none: { status: "draft", label: "no key" },
  unchecked: { status: "draft", label: "not verified" },
  checking: { status: "running", label: "verifying" },
  valid: { status: "completed", label: "verified" },
  invalid: { status: "error", label: "rejected" },
};
function onKeyInput() {
  props.research.keyStatus.value = props.research.apiKey.value ? "unchecked" : "none";
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="overlay-surface settings sm:max-w-[520px]" :show-close-button="false">
      <DialogTitle class="dialog-title">model &amp; data</DialogTitle>
      <DialogDescription class="dialog-copy">choose how scenarios are analysed and control what is stored on this device.</DialogDescription>

      <section class="block">
        <div class="row-between">
          <p class="label mono">account</p>
          <StatusBadge
            size="sm"
            :status="account.account.loading ? 'running' : account.account.user ? 'completed' : 'draft'"
            :label="account.account.loading ? 'checking' : account.account.user ? 'signed in' : 'not signed in'"
          />
        </div>
        <div v-if="account.account.user" class="account-row">
          <span class="avatar">{{ (account.account.user.name || account.account.user.email || "r").charAt(0).toLowerCase() }}</span>
          <span class="account-text">
            <span>{{ account.account.user.name || "researcher" }}</span>
            <span class="mono faint">{{ account.account.user.email }}</span>
          </span>
          <button class="ghost-btn mono" type="button" :disabled="account.busy.value" @click="account.signout()">sign out</button>
        </div>
        <template v-else-if="!account.account.loading">
          <button v-if="account.account.providers.google" class="primary-btn" type="button" :disabled="account.busy.value" @click="account.google()">sign in with google</button>
          <p v-else class="hint">google sign-in isn't configured on this server. everything else works locally.</p>
        </template>
        <p class="hint">signing in identifies you; your chats and records still stay in this browser.</p>
        <p v-if="account.error.value" class="error">{{ account.error.value }}</p>
      </section>

      <section class="block">
        <p class="label mono">analysis mode</p>
        <div class="segmented mono" role="group" aria-label="Analysis mode">
          <button :class="{ active: research.settings.mode === 'demo' }" :aria-pressed="research.settings.mode === 'demo'" @click="research.settings.mode = 'demo'">demo · 12 agents</button>
          <button :class="{ active: research.settings.mode === 'openai' }" :aria-pressed="research.settings.mode === 'openai'" @click="research.settings.mode = 'openai'">your openai key</button>
        </div>
        <p class="hint">
          <template v-if="research.settings.mode === 'demo'">illustrative playback only. no model is called and nothing leaves this device.</template>
          <template v-else>each stakeholder's likely stance is scored by your chosen model in one structured request.</template>
        </p>
      </section>

      <section v-if="research.settings.mode === 'openai'" class="block">
        <div class="row-between">
          <label class="label mono" for="openai-key">openai api key</label>
          <StatusBadge size="sm" v-bind="keyBadge[research.keyStatus.value]" />
        </div>
        <div class="key-row">
          <input
            id="openai-key"
            v-model="research.apiKey.value"
            class="field mono"
            :type="showKey ? 'text' : 'password'"
            placeholder="sk-…"
            autocomplete="off"
            spellcheck="false"
            @input="onKeyInput"
          />
          <button class="ghost-btn mono" type="button" @click="showKey = !showKey">{{ showKey ? "hide" : "show" }}</button>
          <button class="primary-btn mono" type="button" :disabled="!research.apiKey.value || research.keyStatus.value === 'checking'" @click="research.testKey()">verify</button>
        </div>
        <p v-if="research.keyError.value" class="error">{{ research.keyError.value }}</p>
        <label class="check">
          <input v-model="research.settings.rememberKey" type="checkbox" />
          <span>remember for this tab only <span class="mono faint">(sessionStorage · cleared when the tab closes)</span></span>
        </label>
        <button v-if="research.apiKey.value" class="link-btn mono" type="button" @click="research.forgetKey()">forget key</button>

        <div class="grid3">
          <label>
            <span class="label mono">model</span>
            <select v-model="research.settings.model" class="field mono" :disabled="!research.models.value.length">
              <option v-if="!research.models.value.length" value="">verify key to load models</option>
              <option v-for="model in research.models.value" :key="model" :value="model">{{ model }}</option>
            </select>
          </label>
          <label>
            <span class="label mono">temperature</span>
            <input v-model.number="research.settings.temperature" class="field mono" type="number" min="0" max="1" step="0.1" />
          </label>
          <label>
            <span class="label mono">seed</span>
            <input v-model.number="research.settings.seed" class="field mono" type="number" min="0" step="1" />
          </label>
        </div>
        <p class="hint">temperature 0 and a fixed seed make results as repeatable as openai allows. identical runs reuse the saved result; use "re-run fresh" to sample again.</p>
      </section>

      <section class="block privacy">
        <p class="label mono">where your data goes</p>
        <ul>
          <li>chats, records and settings are stored only in this browser (indexeddb / localstorage). microfish has no server-side database.</li>
          <li v-if="research.settings.mode === 'openai'">your key and scenario go <b>directly from this browser to api.openai.com</b> — never through a microfish server. openai's api data policies apply.</li>
          <li>your key is never written to disk; "remember" keeps it only until this tab closes.</li>
          <li>deleting a chat deletes its records and cached results. semantic search runs locally.</li>
        </ul>
      </section>

      <section class="block">
        <div class="row-between">
          <p class="label mono">research records</p>
          <span class="mono faint">{{ research.recordCount.value }} saved · storage {{ research.persistent.value ? "persistent" : "best-effort" }}</span>
        </div>
        <div class="actions">
          <button class="ghost-btn mono" type="button" :disabled="!research.recordCount.value" @click="research.exportAll('csv')">export all · csv</button>
          <button class="ghost-btn mono" type="button" :disabled="!research.recordCount.value" @click="research.exportAll('json')">export all · json</button>
          <span class="spacer"></span>
          <button v-if="!confirmDelete" class="danger-btn mono" type="button" @click="confirmDelete = true">delete all local data</button>
          <template v-else>
            <span class="mono faint">this can't be undone</span>
            <button class="ghost-btn mono" type="button" @click="confirmDelete = false">cancel</button>
            <button class="danger-btn solid mono" type="button" @click="research.deleteAllData()">delete everything</button>
          </template>
        </div>
      </section>

      <div class="footer">
        <button class="primary-btn mono" type="button" @click="open = false">done</button>
      </div>
    </DialogContent>
  </Dialog>
</template>

<style scoped>
.settings {
  max-height: calc(100dvh - 32px);
  overflow-y: auto;
}
.block {
  display: grid;
  gap: 8px;
  padding-top: 14px;
  border-top: 1px solid var(--hairline);
}
.label {
  margin: 0;
  color: var(--faint);
}
.faint {
  color: var(--faint);
  font-size: 11px;
}
.row-between {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.key-row {
  display: flex;
  gap: 6px;
}
.grid3 {
  display: grid;
  grid-template-columns: 2fr 1fr 1fr;
  gap: 8px;
  margin-top: 4px;
}
.grid3 label {
  display: grid;
  gap: 4px;
}
.check {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--body);
  font-size: 13px;
}
.check input {
  accent-color: var(--accent);
}
.error {
  margin: 0;
  color: var(--danger);
  font-size: 12.5px;
}
.privacy ul {
  margin: 0;
  padding-left: 16px;
  list-style: disc;
  color: var(--body);
  font-size: 12.5px;
  line-height: 1.6;
}
.privacy b {
  color: var(--ink);
  font-weight: 500;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}
.spacer {
  flex: 1;
}
.ghost-btn,
.primary-btn,
.danger-btn {
  height: 30px;
  padding: 0 10px;
  border: 1px solid var(--hairline);
  border-radius: 8px;
  background: var(--canvas);
  color: var(--muted);
  font-size: 11.5px;
  white-space: nowrap;
}
.ghost-btn:hover:not(:disabled) {
  color: var(--ink);
}
.primary-btn:disabled,
.ghost-btn:disabled {
  opacity: 0.45;
}
.danger-btn {
  border-color: color-mix(in srgb, var(--danger) 40%, transparent);
  color: var(--danger);
}
.danger-btn.solid {
  background: var(--danger);
  color: #fff;
}
.account-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.account-text {
  display: grid;
  flex: 1;
  min-width: 0;
  color: var(--ink);
  font-size: 13px;
}
.footer {
  display: flex;
  justify-content: flex-end;
}
@media (max-width: 520px) {
  .grid3 {
    grid-template-columns: 1fr 1fr;
  }
  .grid3 label:first-child {
    grid-column: 1 / -1;
  }
}
</style>
