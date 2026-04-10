import type { PropertyPanelOverlay } from '@easyink/core'
import type { BindingRef } from '@easyink/schema'
import type { DesignerStore } from '../store/designer-store'
import type { MaterialExtensionContext } from '../types'

/**
 * Create a MaterialExtensionContext that delegates to the DesignerStore.
 * This context is passed to MaterialExtensionFactory when instantiating extensions.
 */
export function createMaterialExtensionContext(store: DesignerStore): MaterialExtensionContext {
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>()

  return {
    getSchema() {
      return store.schema
    },
    getNode(id: string) {
      return store.getElementById(id)
    },

    getSelection() {
      return {
        ids: store.selection.ids,
        count: store.selection.count,
        isEmpty: store.selection.isEmpty,
      }
    },

    getBindingLabel(binding: BindingRef): string {
      return binding.fieldLabel || binding.fieldPath || ''
    },

    commitCommand(command) {
      store.commands.execute(command)
    },

    requestPropertyPanel(overlay: PropertyPanelOverlay | null) {
      store.setPropertyOverlay(overlay)
    },

    emit(event: string, payload: unknown) {
      const handlers = listeners.get(event)
      if (handlers) {
        for (const handler of handlers) {
          handler(payload)
        }
      }
    },

    on(event: string, handler: (...args: unknown[]) => void): () => void {
      let handlers = listeners.get(event)
      if (!handlers) {
        handlers = new Set()
        listeners.set(event, handlers)
      }
      handlers.add(handler)
      return () => {
        handlers!.delete(handler)
        if (handlers!.size === 0) {
          listeners.delete(event)
        }
      }
    },

    getZoom() {
      return store.workbench.viewport.zoom
    },

    getPageEl() {
      return store.getPageEl()
    },

    t(key: string) {
      return store.t(key)
    },
  }
}
