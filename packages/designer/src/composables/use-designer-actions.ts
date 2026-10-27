import type { DesignerAction } from '@easyink/plugin-api/ui'
import { computed, onBeforeUnmount, shallowRef } from 'vue'
import { useDesignerStore } from './use-designer-store'

/** The two fixed action consumers share ordering and local failure handling. */
export function useDesignerActions(point: 'designer.toolbar' | 'designer.context-menu') {
  const store = useDesignerStore()
  const failures = shallowRef(new Set<string>())
  const mounts = new Map<string, ReturnType<typeof store.mountUIContext>>()
  onBeforeUnmount(() => {
    for (const mount of mounts.values())
      void mount.dispose()
    mounts.clear()
  })

  function fail(key: string, id: string, pluginId: string, cause: unknown) {
    if (failures.value.has(key))
      return
    failures.value = new Set([...failures.value, key])
    store.diagnostics.push({
      source: 'material-extension',
      severity: 'error',
      message: `Extension action failed: ${pluginId}/${id}`,
      detail: { point, cause },
    })
    void mounts.get(key)?.dispose()
  }

  const actions = computed(() => store.getContributions(point).map((entry) => {
    const action = entry.value as DesignerAction
    const key = `${entry.owner.installationId}:${entry.owner.contributionId}`
    let mount = mounts.get(key)
    if (!mount) {
      mount = store.mountUIContext(entry.owner)
      mounts.set(key, mount)
    }
    const context = mount.context
    let disabled = failures.value.has(key)
    if (!disabled) {
      try {
        disabled = action.disabled?.(context) ?? false
      }
      catch (cause) {
        fail(key, action.id, entry.owner.pluginId, cause)
        disabled = true
      }
    }
    return { key, action, context, owner: entry.owner, disabled, failed: failures.value.has(key), label: store.t(action.label) }
  }).sort((a, b) => (a.action.order ?? 0) - (b.action.order ?? 0)))

  async function run(entry: (typeof actions.value)[number]) {
    if (entry.disabled || entry.context.signal.aborted)
      return
    try {
      if (entry.action.disabled?.(entry.context))
        return
      await entry.action.onClick(entry.context)
    }
    catch (cause) {
      if (!entry.context.signal.aborted)
        fail(entry.key, entry.action.id, entry.owner.pluginId, cause)
    }
  }

  return { actions, run }
}
