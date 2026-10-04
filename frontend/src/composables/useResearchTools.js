import { onScopeDispose, ref, toValue, watch } from 'vue'
import { readJson } from '../lib/storage.js'
import { normalizeResearchTools, researchToolsStorageKey, serializedResearchTools } from '../lib/researchTools.js'

export function useResearchTools(workspaceKey) {
  const data = ref({ version: 1, documents: [], reviews: [] })
  const warning = ref('')
  let key = ''
  let expectedSnapshot = null
  let conflict = false
  let memoryOnly = false

  function load() {
    key = researchToolsStorageKey(toValue(workspaceKey))
    conflict = false
    memoryOnly = false
    expectedSnapshot = null
    warning.value = ''
    data.value = normalizeResearchTools(readJson(key, null))
    try { expectedSnapshot = window.localStorage.getItem(key) } catch {
      memoryOnly = true
      warning.value = 'Browser storage is unavailable. Sources and reviews will last only for this visit.'
    }
  }
  watch(() => toValue(workspaceKey), load, { immediate: true, flush: 'sync' })

  function save(next) {
    if (conflict) return false
    if (memoryOnly) { data.value = next; return true }
    try {
      if (window.localStorage.getItem(key) !== expectedSnapshot) {
        conflict = true
        warning.value = 'Research tools changed in another tab. Reload this page before editing to preserve both versions.'
        return false
      }
      const snapshot = serializedResearchTools(next)
      window.localStorage.setItem(key, snapshot)
      expectedSnapshot = snapshot
      data.value = next
      warning.value = ''
      return true
    } catch (error) {
      if (error.name === 'SecurityError') {
        memoryOnly = true
        data.value = next
        warning.value = 'Browser storage is unavailable. Sources and reviews will last only for this visit.'
        return true
      }
      warning.value = error.message?.startsWith('Research storage is full') ? error.message : 'These changes could not be saved. Free browser storage and try again.'
      return false
    }
  }
  function onStorage(event) {
    if (event.key !== key && event.key !== null) return
    conflict = true
    warning.value = 'Research tools changed in another tab. Reload this page before editing to preserve both versions.'
  }
  window.addEventListener('storage', onStorage)
  onScopeDispose(() => window.removeEventListener('storage', onStorage))
  return { data, warning, save }
}
