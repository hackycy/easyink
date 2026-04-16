import type { PreferenceProvider, WorkbenchState } from '../types'
import { onBeforeUnmount, watch } from 'vue'
import { saveWorkbenchPreferences } from '../store/preference-persistence'

/**
 * Watch persistable workbench state slices and debounce-save via PreferenceProvider.
 * Must be called during component setup (uses onBeforeUnmount).
 */
export function useWorkbenchPersistence(
  workbench: WorkbenchState,
  provider: PreferenceProvider,
): void {
  let timer: ReturnType<typeof setTimeout> | null = null

  function scheduleSave() {
    if (timer)
      clearTimeout(timer)
    timer = setTimeout(() => {
      saveWorkbenchPreferences(provider, workbench)
    }, 500)
  }

  // Only watch the persistable slices, skip status and ephemeral snap guides.
  watch(
    [
      () => workbench.windows,
      () => workbench.toolbar,
      () => workbench.panels,
      () => workbench.viewport.zoom,
      () => workbench.snap.enabled,
      () => workbench.snap.gridSnap,
      () => workbench.snap.guideSnap,
      () => workbench.snap.elementSnap,
      () => workbench.snap.threshold,
    ],
    scheduleSave,
    { deep: true },
  )

  // Flush pending save on unmount
  onBeforeUnmount(() => {
    if (timer)
      clearTimeout(timer)
    saveWorkbenchPreferences(provider, workbench)
  })
}
