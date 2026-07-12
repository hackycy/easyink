import type { CompiledMaterialProfile } from '@easyink/core'
import type { PreparedDesignerMaterialBundle } from '../material-host'
import type { DesignerStore } from '../store/designer-store'
import { prepareDesignerMaterialBundle } from '../material-host'
import { createMaterialExtensionContext } from './extension-context'
import { registerMaterialBundle } from './registry'

type PrepareDesignerMaterialBundle = (
  profile: CompiledMaterialProfile,
  services: ReturnType<typeof createMaterialExtensionContext>,
) => Promise<PreparedDesignerMaterialBundle>

export interface RuntimeMaterialProfileRegistration {
  update: (profiles: readonly CompiledMaterialProfile[]) => void
  dispose: () => Promise<void>
}

export function createRuntimeMaterialProfileRegistration(
  store: DesignerStore,
  prepare: PrepareDesignerMaterialBundle = prepareDesignerMaterialBundle,
): RuntimeMaterialProfileRegistration {
  let generation = 0
  let disposed = false
  let active: { prepared: PreparedDesignerMaterialBundle[], unregister: Array<() => void> } | undefined
  const tasks = new Set<Promise<void>>()
  const disposals = new Set<Promise<unknown>>()

  function scheduleDisposal(prepared: readonly PreparedDesignerMaterialBundle[]): void {
    for (const result of prepared) {
      let resultPromise: Promise<readonly unknown[]>
      try {
        resultPromise = Promise.resolve(result.dispose())
      }
      catch (error) {
        resultPromise = Promise.reject(error)
      }
      const disposal = resultPromise.finally(() => disposals.delete(disposal))
      disposals.add(disposal)
    }
  }

  function retireActive(): void {
    if (!active)
      return
    for (let index = active.unregister.length - 1; index >= 0; index--)
      active.unregister[index]!()
    scheduleDisposal(active.prepared)
    active = undefined
  }

  async function prepareGeneration(profiles: readonly CompiledMaterialProfile[], expectedGeneration: number): Promise<void> {
    const services = createMaterialExtensionContext(store)
    const settled = await Promise.allSettled(profiles.map(profile => prepare(profile, services)))
    const prepared = settled.flatMap(result => result.status === 'fulfilled' ? [result.value] : [])
    if (disposed || generation !== expectedGeneration || settled.some(result => result.status === 'rejected')) {
      scheduleDisposal(prepared)
      if (!disposed && generation === expectedGeneration) {
        for (const result of settled) {
          if (result.status === 'rejected') {
            store.diagnostics.push({
              source: 'material-extension',
              severity: 'error',
              message: 'Material profile failed to prepare',
              detail: { reason: result.reason },
            })
          }
        }
      }
      return
    }

    const unregister: Array<() => void> = []
    for (const result of prepared) {
      unregister.push(registerMaterialBundle(store, result.bundle))
      store.notifyMaterialExtensionLoaded()
      for (const diagnostic of result.diagnostics) {
        store.diagnostics.push({
          source: 'material-extension',
          severity: diagnostic.severity === 'warning' ? 'warn' : diagnostic.severity,
          message: diagnostic.message,
          detail: diagnostic as unknown as Record<string, unknown>,
        })
      }
    }
    active = { prepared, unregister }
  }

  return {
    update(profiles) {
      if (disposed)
        return
      generation += 1
      retireActive()
      if (profiles.length === 0)
        return
      const task = prepareGeneration([...profiles], generation).finally(() => tasks.delete(task))
      tasks.add(task)
    },
    async dispose() {
      if (!disposed) {
        disposed = true
        generation += 1
        retireActive()
      }
      await Promise.all([...tasks])
      await Promise.all([...disposals])
    },
  }
}
