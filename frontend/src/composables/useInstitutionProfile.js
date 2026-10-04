import { getCurrentScope, onScopeDispose, reactive, toRefs, unref, watch } from 'vue'
import { createInstitutionProfileController } from '../lib/institutionProfile.js'

export function useInstitutionProfile(account, university, options = {}) {
  const controller = createInstitutionProfileController({ ...options, stateFactory: reactive })
  const stop = watch(
    () => {
      const current = unref(account)
      const selection = unref(university)
      return [current?.loading, current?.user?.id || current?.user?.email || null, selection?.id, selection?.name, current?.openaiConnected, current?.anthropicConnected]
    },
    ([loading, accountId, id, name, openaiConnected, anthropicConnected]) => {
      void controller.setScope({ accountId: loading ? null : accountId, university: id ? { id, name } : null, openaiConnected, anthropicConnected })
    },
    { immediate: true, flush: 'sync' },
  )
  const dispose = () => { stop(); controller.dispose() }
  if (getCurrentScope()) onScopeDispose(dispose)
  return { ...toRefs(controller.state), refresh: controller.refresh, dispose }
}
