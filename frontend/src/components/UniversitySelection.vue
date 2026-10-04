<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'
import { UNIVERSITIES, normalizeUniversity } from '../lib/researcherProfile.js'

const props = defineProps({
  university: { type: Object, default: null },
  error: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
})
const emit = defineEmits(['save', 'editing'])
const editing = ref(!props.university)
const query = ref('')
const choice = ref(null)
const customName = ref('')
const opened = ref(false)
const activeIndex = ref(-1)
const input = ref(null)
const customInput = ref(null)
const changeButton = ref(null)
const localError = ref('')
const matches = computed(() => {
  const term = query.value.trim().toLocaleLowerCase()
  return UNIVERSITIES.filter(item => `${item.name} ${item.aliases.join(' ')}`.toLocaleLowerCase().includes(term)).slice(0, 7)
})
const options = computed(() => [
  ...matches.value,
  { id: 'other', name: 'My university or institution isn’t listed' },
  { id: 'independent', name: 'Independent researcher' },
])
const selection = computed(() => normalizeUniversity(choice.value?.id === 'other'
  ? { id: 'other', name: customName.value }
  : choice.value))

function restore() {
  choice.value = props.university
  query.value = props.university?.name || ''
  customName.value = props.university?.id === 'other' ? props.university.name : ''
  opened.value = false
  localError.value = ''
}
watch(() => props.university, async (value, previous) => {
  const focusWasInside = editing.value
  restore()
  editing.value = !value
  if (value && previous !== value && focusWasInside) {
    await nextTick()
    changeButton.value?.focus()
  }
}, { immediate: true })
watch(editing, value => emit('editing', value), { immediate: true })
watch(query, () => { activeIndex.value = -1 })

async function edit() {
  restore()
  editing.value = true
  await nextTick()
  input.value?.focus()
  input.value?.select()
}
async function cancel() {
  restore()
  editing.value = false
  await nextTick()
  changeButton.value?.focus()
}
function search() {
  choice.value = null
  customName.value = ''
  localError.value = ''
  opened.value = true
}
async function select(option) {
  choice.value = option
  query.value = option.name
  opened.value = false
  activeIndex.value = -1
  localError.value = ''
  if (option.id === 'other') {
    await nextTick()
    customInput.value?.focus()
  }
}
async function keydown(event) {
  if (event.isComposing) return
  if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
    event.preventDefault()
    opened.value = true
    const direction = event.key === 'ArrowDown' ? 1 : -1
    activeIndex.value = activeIndex.value < 0 ? (direction === 1 ? 0 : options.value.length - 1) : (activeIndex.value + direction + options.value.length) % options.value.length
    await nextTick()
    document.getElementById(`university-option-${activeIndex.value}`)?.scrollIntoView({ block: 'nearest' })
  } else if (event.key === 'Enter' && opened.value) {
    event.preventDefault()
    if (activeIndex.value >= 0) select(options.value[activeIndex.value])
    else if (matches.value.length === 1) select(matches.value[0])
  } else if (event.key === 'Escape' && opened.value) {
    event.preventDefault()
    event.stopPropagation()
    opened.value = false
  } else if (event.key === 'Tab') opened.value = false
}
function save() {
  if (props.disabled) return
  if (!selection.value) {
    localError.value = 'Choose a university or enter your institution’s name.'
    ;(choice.value?.id === 'other' ? customInput.value : input.value)?.focus()
    return
  }
  emit('save', selection.value)
}
</script>

<template>
  <section class="university-step" aria-labelledby="university-step-title">
    <div class="university-heading">
      <span class="university-step-icon"><AppIcon :name="university ? 'check' : 'people'" :size="15" /></span>
      <div><h3 id="university-step-title">Your university</h3><p>Which university or institution is your research with?</p></div>
    </div>

    <div v-if="university && !editing" class="university-selected">
      <div><span>University / institution</span><strong>{{ university.name }}</strong></div>
      <button ref="changeButton" type="button" :disabled="disabled" @click="edit">Change university</button>
    </div>
    <form v-else @submit.prevent="save" @focusout="event => { if (!event.currentTarget.contains(event.relatedTarget)) opened = false }">
      <label for="researcher-university">University or institution</label>
      <div class="university-search">
        <AppIcon name="search" :size="16" />
        <input
          id="researcher-university" ref="input" v-model="query" type="text" role="combobox"
          autocomplete="off" spellcheck="false" placeholder="Search by name or abbreviation"
          :disabled="disabled" :aria-expanded="opened" aria-autocomplete="list"
          aria-controls="university-options" :aria-activedescendant="opened && activeIndex >= 0 ? `university-option-${activeIndex}` : undefined"
          aria-describedby="university-note" :aria-invalid="Boolean(localError)" maxlength="160"
          @input="search" @focus="opened = true" @keydown="keydown"
        />
      </div>
      <ul v-if="opened" id="university-options" role="listbox" aria-label="Universities and institutions">
        <li v-if="!matches.length" class="university-no-match" role="presentation">No university matches. Add your institution below.</li>
        <li v-for="(option, index) in options" :id="`university-option-${index}`" :key="option.id"
            role="option" :aria-selected="choice?.id === option.id" :class="{ active: activeIndex === index, fallback: ['other', 'independent'].includes(option.id) }"
            @mousedown.prevent @click="select(option)">{{ option.name }}</li>
      </ul>
      <template v-if="choice?.id === 'other'">
        <label for="researcher-custom-university" class="custom-label">Institution name</label>
        <input id="researcher-custom-university" ref="customInput" v-model="customName" class="custom-university"
               type="text" maxlength="120" placeholder="Enter your university or institution" :disabled="disabled" :aria-invalid="Boolean(localError)" aria-describedby="university-note" @input="localError = ''" />
      </template>
      <p id="university-note" class="university-note">Select a match, add an institution, or choose independent researcher. You can change this later.</p>
      <p v-if="localError" class="university-error" role="alert">{{ localError }}</p>
      <div class="university-actions">
        <button type="submit" class="university-save" :disabled="disabled || !selection">Save university</button>
        <button v-if="university" type="button" :disabled="disabled" @click="cancel">Cancel</button>
      </div>
    </form>
    <p v-if="error" class="university-error" role="status">{{ error }}</p>
    <p v-if="!error" class="university-note">{{ university ? 'Saved for your Google account in this browser.' : 'Your choice will be saved for your Google account in this browser.' }}</p>
  </section>
</template>

<style scoped>
.university-step { border-top: 1px solid var(--ui-border); padding-top: 20px; margin-top: 20px; }
.university-heading { display: flex; gap: 10px; margin-bottom: 18px; align-items: flex-start; }
.university-step-icon { display: grid; place-items: center; flex-shrink: 0; width: 28px; height: 28px; border-radius: 50%; color: var(--ui-accent); background: var(--ui-selected); border: 1px solid var(--ui-border); }
h3 { font-size: .875rem; font-weight: 650; line-height: 1.45; margin: 3px 0 5px; }
.university-heading p, .university-note { font-size: .75rem; line-height: 1.7; color: var(--ui-muted); margin: 0; }
.university-note { margin-top: 12px; }
label { display: block; font-size: .75rem; font-weight: 600; margin-bottom: 8px; }
.university-search { position: relative; display: flex; align-items: center; gap: 10px; padding: 0 12px; border: 1px solid var(--ui-control-border); border-radius: 8px; color: var(--ui-muted); }
.university-search > svg { flex-shrink: 0; }
.university-search:focus-within { outline: 2px solid var(--ui-focus); outline-offset: 2px; }
.university-search input { outline: 0; border: 0; background: transparent; min-width: 0; width: 100%; min-height: 44px; padding: 11px 0; font-size: 1rem; color: var(--ui-text); }
input::placeholder { color: var(--ui-muted); }
ul { max-height: 260px; overflow-y: auto; overscroll-behavior: contain; background: var(--ui-surface); border: 1px solid var(--ui-control-border); border-radius: 8px; padding: 5px; margin: 8px 0 0; list-style: none; box-shadow: var(--ui-shadow); }
li { padding: 11px 10px; border-radius: 4px; min-height: 44px; font-size: .8125rem; line-height: 1.6; color: var(--ui-text); cursor: pointer; overflow-wrap: anywhere; }
li.active, li[aria-selected="true"], li[role="option"]:hover { background: var(--ui-selected); color: var(--ui-accent); }
li.fallback { border-top: 1px solid var(--ui-border); border-radius: 0; color: var(--ui-accent); }
.university-no-match { color: var(--ui-muted); cursor: default; }
.custom-label { margin-top: 16px; }
.custom-university { width: 100%; min-height: 44px; padding: 10px 12px; font-size: 1rem; border: 1px solid var(--ui-control-border); border-radius: 8px; color: var(--ui-text); background: var(--ui-surface); }
.university-actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 16px; }
button { background: transparent; color: var(--ui-accent); border: 0; border-radius: 8px; min-height: 44px; padding: 10px 12px; font-size: .8125rem; font-weight: 600; cursor: pointer; }
button:hover:not(:disabled) { background: var(--ui-hover); }
.university-save { border: 1px solid var(--ui-control-border); background: var(--ui-selected); }
button:disabled { opacity: .6; cursor: not-allowed; }
button:focus-visible, .custom-university:focus-visible { outline: 2px solid var(--ui-focus); outline-offset: 3px; }
.university-selected { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; background: var(--ui-surface-alt); padding: 12px; border-radius: 8px; }
.university-selected > div { flex: 1 1 180px; min-width: 0; }
.university-selected span { display: block; font-size: .6875rem; color: var(--ui-muted); margin-bottom: 5px; }
.university-selected strong { display: block; font-size: .875rem; font-weight: 600; line-height: 1.55; overflow-wrap: anywhere; }
.university-error { font-size: .8125rem; color: var(--ui-danger); line-height: 1.6; margin: 12px 0 0; }
</style>
