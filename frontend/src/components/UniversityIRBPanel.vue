<script setup>
import { computed } from 'vue'
import AppIcon from './AppIcon.vue'

const props = defineProps({
  university: { type: Object, default: null },
  profile: { type: Object, default: null },
  state: { type: String, default: 'idle' },
  error: { type: String, default: '' },
  provider: { type: String, default: '' },
  compact: Boolean,
})
defineEmits(['refresh'])
const reviewers = computed(() => props.profile?.reviewers || [])
const publicCount = computed(() => reviewers.value.filter(item => item.kind === 'public-profile').length)
const sources = computed(() => (props.profile?.sources || []).filter(item => safeUrl(item.url)))
const date = computed(() => {
  const value = new Date(props.profile?.retrievedAt || '')
  return Number.isFinite(value.getTime()) ? value.toLocaleString() : ''
})
function safeUrl(value) {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : null } catch { return null }
}
</script>

<template>
  <section class="university-irb-panel" :class="{ compact }" aria-label="University IRB reviewers" :aria-busy="state === 'loading'">
    <div class="irb-heading">
      <div><span class="irb-eyebrow">University personalization</span><h3>{{ university?.name || profile?.university?.name || 'Your university' }}</h3></div>
      <button v-if="university && university.id !== 'independent'" type="button" :disabled="state === 'loading'" @click="$emit('refresh')">{{ state === 'loading' ? 'Checking…' : 'Refresh sources' }}</button>
    </div>
    <p v-if="state === 'loading'" class="irb-loading" role="status"><span class="irb-spinner"></span> Finding public IRB members and university guidance…</p>
    <p v-else-if="!profile && !error" class="irb-note">{{ university ? 'Run your simulation or refresh sources to check this university’s public IRB information.' : 'Save your university to find public board members and research review guidance.' }}</p>
    <p v-if="error" class="irb-error" role="status">{{ error }}</p>
    <template v-if="profile && state !== 'loading'">
      <p class="irb-status" role="status"><AppIcon :name="publicCount ? 'check' : 'info'" :size="15" />{{ publicCount ? `${publicCount} public member ${publicCount === 1 ? 'profile' : 'profiles'} verified` : 'Composite reviewers · public membership not verified' }}<span v-if="profile.policies?.length"> · {{ profile.policies.length }} {{ profile.policies.length === 1 ? 'source' : 'sources' }} for university review guidance</span></p>
      <div class="irb-reviewers">
        <article v-for="(reviewer, index) in reviewers" :key="reviewer.id || index">
          <span class="irb-kind">{{ reviewer.kind === 'public-profile' ? 'Public member profile · simulated agent' : 'Composite · simulated agent' }}</span>
          <strong>{{ reviewer.name }}</strong><span class="irb-role">{{ reviewer.role }}</span>
          <p v-if="!compact && reviewer.background">{{ reviewer.background }}</p>
          <a v-if="reviewer.kind === 'public-profile' && safeUrl(reviewer.sourceUrls?.[0])" :href="safeUrl(reviewer.sourceUrls[0])" target="_blank" rel="noopener noreferrer">Official membership source <AppIcon name="arrow-up-right" :size="12" /></a>
        </article>
      </div>
      <p class="irb-note">AI agents use the published roles and verified university guidance to ask review questions. Their responses are simulated, and do not speak for the people named.</p>
      <details v-if="sources.length || profile.policies?.length" class="irb-sources">
        <summary>University sources & review guidance · {{ sources.length }}</summary>
        <ul v-if="profile.policies?.length"><li v-for="(policy, index) in profile.policies" :key="index"><strong>{{ policy.title }}</strong><p>{{ policy.summary }}</p><a v-if="safeUrl(policy.sourceUrl)" :href="safeUrl(policy.sourceUrl)" target="_blank" rel="noopener noreferrer">Read university guidance ↗</a></li></ul>
        <ul><li v-for="source in sources" :key="source.url"><a :href="source.url" target="_blank" rel="noopener noreferrer">{{ source.title || source.url }}</a></li></ul>
      </details>
      <details v-if="profile.warnings?.length" class="irb-sources"><summary>About this source snapshot</summary><p v-for="warning in profile.warnings" :key="warning" class="irb-note">{{ warning }}</p></details>
      <p v-if="date" class="irb-date">Checked {{ date }}<span v-if="provider"> · {{ provider === 'anthropic' ? 'Anthropic' : provider === 'openai' ? 'OpenAI' : 'Official university websites' }}</span></p>
    </template>
  </section>
</template>

<style scoped>
.university-irb-panel { border:1px solid var(--ui-border); border-radius:12px; padding:20px; background:var(--ui-surface); color:var(--ui-text); }
.irb-heading { display:flex; justify-content:space-between; align-items:flex-start; gap:12px; }
.irb-eyebrow { color:var(--ui-accent); font-size:.65rem; font-weight:600; text-transform:uppercase; letter-spacing:.09em; }
h3 { font-size:1rem; line-height:1.5; margin:5px 0 0; }
button { border:0; background:var(--ui-selected); color:var(--ui-accent); border-radius:7px; font-size:.72rem; padding:9px 12px; min-height:36px; flex-shrink:0; }
button:disabled { opacity:.6; }
.irb-loading, .irb-status { display:flex; align-items:center; flex-wrap:wrap; gap:7px; font-size:.76rem; line-height:1.7; color:var(--ui-accent); margin:16px 0; }
.irb-spinner { width:15px; height:15px; border:2px solid var(--ui-border); border-top-color:var(--ui-accent); border-radius:50%; animation:irb-spin 1s linear infinite; }
.irb-reviewers { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:10px; }
.irb-reviewers article { background:var(--ui-surface-alt); border:1px solid var(--ui-border); border-radius:9px; padding:14px; overflow-wrap:anywhere; }
.irb-kind { display:block; color:var(--ui-muted); font-size:.6rem; line-height:1.6; }
.irb-reviewers strong { display:block; font-size:.83rem; line-height:1.5; margin-top:7px; }
.irb-role { display:block; color:var(--ui-accent); font-size:.71rem; line-height:1.6; margin-top:4px; }
.irb-reviewers p, .irb-note { font-size:.72rem; color:var(--ui-muted); line-height:1.7; margin:12px 0 0; }
a { color:var(--ui-accent); font-size:.71rem; line-height:1.7; overflow-wrap:anywhere; }
.irb-reviewers a { display:inline-flex; align-items:center; gap:3px; margin-top:10px; }
.irb-sources { font-size:.73rem; line-height:1.7; margin-top:14px; }
summary { cursor:pointer; color:var(--ui-accent); }
ul { padding-left:18px; }
li { margin-bottom:10px; }
li p { color:var(--ui-muted); margin:4px 0; }
.irb-date { font-size:.65rem; color:var(--ui-muted); margin:14px 0 0; line-height:1.7; }
.irb-error { color:var(--ui-warning); background:var(--ui-warning-bg); border-radius:8px; padding:10px; font-size:.76rem; line-height:1.7; }
.compact { padding:16px; }
button:focus-visible, a:focus-visible, summary:focus-visible { outline:2px solid var(--ui-focus); outline-offset:3px; }
@keyframes irb-spin { to { transform:rotate(360deg); } }
@media (prefers-reduced-motion:reduce) { .irb-spinner { animation:none; } }
@media (max-width:620px) { .irb-reviewers { grid-template-columns:1fr; } .irb-heading { flex-wrap:wrap; } }
</style>
