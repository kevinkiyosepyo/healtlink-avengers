<script setup>
import { computed, ref, watch } from 'vue'
import UniversitySelection from './UniversitySelection.vue'
import UniversityIRBPanel from './UniversityIRBPanel.vue'
import { useInstitutionProfile } from '../composables/useInstitutionProfile.js'

defineEmits(['account'])
const university = ref(null)
// The preview only requests public source data. It has no authenticated session
// and cannot create a signed snapshot or make a paid model request.
const { profile, state, error, refresh } = useInstitutionProfile({ user: { id: 'public-university-preview' } }, university)
const heading = ref(null)
const study = ref('A voluntary survey of university students about sleep habits. We plan to collect email addresses for follow-up and recruit through course announcements.')
const reviews = ref([])
const canReview = computed(() => state.value === 'ready' && profile.value?.reviewers?.length && study.value.trim())
watch(university, () => { reviews.value = [] })
watch(study, () => { reviews.value = [] })
watch(profile, () => { reviews.value = [] })
function review() {
  if (!canReview.value) return
  const topic = /survey|questionnaire/i.test(study.value) ? 'the survey' : 'this study'
  const contact = /email|contact|identif|record/i.test(study.value)
    ? 'How will identifiers be separated from responses, who can access them, and when will they be deleted?'
    : 'Could the study data identify a participant, and what access and retention safeguards will you use?'
  const recruitment = /student|course|class/i.test(study.value)
    ? 'How will you explain that participation has no effect on grades or standing, and offer a way to decline privately?'
    : 'How will you make recruitment voluntary and accessible without pressure from the research team?'
  const questions = [
    [`What information is still needed to assess the risks and purpose of ${topic}?`, 'Which activities, participant groups, and data will be covered by the proposed protocol?'],
    [contact, 'What will the consent information say about follow-up, withdrawal, and use of participant data?'],
    [recruitment, 'How will you make the consent process understandable to the people you hope to recruit?'],
  ]
  reviews.value = profile.value.reviewers.slice(0, 3).map((reviewer, index) => ({ reviewer, questions: questions[index] }))
}
defineExpose({ focusHeading: () => heading.value?.focus() })
</script>

<template>
  <main class="university-preview">
    <header><span class="preview-eyebrow">University IRB simulation</span><h1 ref="heading" tabindex="-1">A review panel for your university.</h1><p>Choose your institution. We’ll check its public IRB sources and build simulated reviewer profiles.</p></header>
    <div class="preview-layout">
      <section class="preview-selection">
        <UniversitySelection :university="university" save-label="Find my university’s IRB" save-note="This preview checks public university websites. No account or API key needed. Universities without a public roster use labeled composite reviewers." @save="university = $event" />
        <p class="preview-suggestion">Try UC San Francisco for public IRB member profiles, or UC San Diego for a policy-based panel.</p>
      </section>
      <UniversityIRBPanel v-if="university" compact :university="university" :profile="profile" :state="state" :error="error" provider="public" @refresh="refresh" />
      <section v-else class="preview-empty"><span>01 → 02 → 03</span><h2>Your university. Its public sources. Your practice panel.</h2><p>Names appear only when a university’s official membership page verifies the board role. The sample review below uses scripted questions; your connected AI provider powers full study reviews.</p></section>
    </div>
    <section v-if="profile && state === 'ready'" class="preview-study">
      <div><span class="preview-eyebrow">Try your panel</span><h2>Practice an IRB review</h2><p>Live university sources · scripted sample questions</p></div>
      <label for="preview-study">Your study scenario</label><textarea id="preview-study" v-model="study" rows="3" maxlength="2000" />
      <div class="preview-actions"><button type="button" class="preview-primary" :disabled="!canReview" @click="review">Run example review</button><button type="button" class="preview-secondary" @click="$emit('account')">Connect AI for a full simulation ↗</button></div>
      <div v-if="reviews.length" class="preview-reviews" aria-live="polite">
        <h3>Simulated panel questions</h3><p class="preview-review-note">These example prompts demonstrate the panel. They are scripted practice questions, not model-generated responses or statements by the members named.</p>
        <article v-for="(item, index) in reviews" :key="item.reviewer.id"><span class="preview-number">0{{ index + 1 }}</span><div><strong>{{ item.reviewer.kind === 'public-profile' ? `Simulated reviewer informed by ${item.reviewer.name}` : `${item.reviewer.name} (composite)` }}</strong><span class="preview-role">{{ item.reviewer.role }}</span><ul><li v-for="question in item.questions" :key="question">{{ question }}</li></ul></div></article>
      </div>
    </section>
  </main>
</template>

<style scoped>
.university-preview { overflow-y:auto; flex:1; padding:38px clamp(20px,4vw,60px) 60px; background:var(--ui-surface-alt); color:var(--ui-text); }
header { max-width:850px; margin-bottom:30px; }
.preview-eyebrow { font-size:.66rem; color:var(--ui-accent); font-weight:600; text-transform:uppercase; letter-spacing:.1em; }
h1 { font-family:var(--font-display); font-size:clamp(2rem,3.5vw,3rem); font-weight:500; letter-spacing:-1px; line-height:1.15; margin:11px 0 15px; }
header p, .preview-study > div > p { color:var(--ui-muted); font-size:.86rem; line-height:1.75; margin:0; }
.preview-layout { display:grid; grid-template-columns:minmax(260px,330px) minmax(0,1fr); gap:22px; align-items:start; }
.preview-selection { padding:0 22px 22px; border:1px solid var(--ui-border); background:var(--ui-surface); border-radius:12px; }
.preview-selection :deep(.university-step) { border-top:0; }
.preview-suggestion { font-size:.72rem; line-height:1.7; color:var(--ui-muted); border-top:1px solid var(--ui-border); padding-top:14px; margin-top:18px; }
.preview-empty { border:1px dashed var(--ui-control-border); border-radius:12px; padding:32px; }
.preview-empty > span { font-size:.78rem; color:var(--ui-accent); letter-spacing:.2em; }
.preview-empty h2 { font-family:var(--font-display); font-size:1.9rem; font-weight:500; line-height:1.3; }
.preview-empty p { font-size:.82rem; color:var(--ui-muted); line-height:1.8; }
.preview-layout :deep(.irb-reviewers) { grid-template-columns:repeat(3,minmax(0,1fr)); }
.preview-layout :deep(.irb-reviewers article) { padding:12px 14px; }
.preview-layout :deep(.irb-reviewers p) { margin-top:7px; }
.preview-study { margin-top:25px; border:1px solid var(--ui-border); border-radius:12px; padding:24px; background:var(--ui-surface); }
.preview-study h2 { font-size:1.2rem; margin:7px 0; }
label { display:block; font-size:.78rem; font-weight:600; margin:22px 0 9px; }
textarea { width:100%; border:1px solid var(--ui-control-border); border-radius:8px; background:var(--ui-surface); color:var(--ui-text); font-size:.86rem; line-height:1.7; padding:13px; resize:vertical; }
.preview-actions { display:flex; flex-wrap:wrap; gap:10px; margin-top:14px; }
button { font-size:.78rem; font-weight:600; min-height:42px; padding:10px 16px; border-radius:8px; cursor:pointer; }
.preview-primary { background:var(--ui-accent); color:var(--ui-on-accent); border:1px solid var(--ui-accent); }
.preview-secondary { color:var(--ui-accent); border:1px solid var(--ui-border); background:var(--ui-surface); }
button:disabled { opacity:.5; }
.preview-reviews { border-top:1px solid var(--ui-border); margin-top:24px; padding-top:22px; }
.preview-reviews h3 { font-size:.95rem; margin:0 0 8px; }
.preview-review-note { font-size:.73rem; line-height:1.7; color:var(--ui-muted); }
.preview-reviews article { display:flex; gap:16px; padding:20px 0; border-bottom:1px solid var(--ui-border); }
.preview-number { color:var(--ui-accent); font-size:.76rem; padding-top:3px; }
.preview-reviews strong { font-size:.86rem; }
.preview-role { display:block; color:var(--ui-accent); font-size:.74rem; margin-top:5px; }
.preview-reviews ul { font-size:.84rem; line-height:1.8; padding-left:19px; margin-bottom:0; }
button:focus-visible, textarea:focus-visible { outline:2px solid var(--ui-focus); outline-offset:3px; }
@media (max-width:1050px) { .preview-layout { grid-template-columns:1fr; } .preview-layout :deep(.irb-reviewers) { grid-template-columns:repeat(3,minmax(0,1fr)); } }
@media (max-width:620px) { .preview-layout :deep(.irb-reviewers) { grid-template-columns:1fr; } .preview-study { padding:18px; } .university-preview { padding-top:24px; } }
</style>
