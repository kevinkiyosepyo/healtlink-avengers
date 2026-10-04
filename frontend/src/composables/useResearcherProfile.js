import { computed, ref, watch } from 'vue'
import { readResearcherUniversity, saveResearcherUniversity } from '../lib/researcherProfile.js'

export function useResearcherProfile(account) {
  let storage
  try { storage = window.localStorage } catch { /* Keep the profile in memory for this visit. */ }
  const identity = computed(() => account.user?.id || account.user?.email || null)
  const university = ref(null)
  const universityError = ref('')

  // Account changes must clear the old selection before a new workspace opens.
  watch(identity, (id) => {
    const result = readResearcherUniversity(storage, id)
    university.value = result.university
    universityError.value = result.error
  }, { immediate: true, flush: 'sync' })

  function saveUniversity(value) {
    const result = saveResearcherUniversity(storage, identity.value, value)
    universityError.value = result.error
    if (result.university) university.value = result.university
  }

  return { university, universityError, saveUniversity }
}
