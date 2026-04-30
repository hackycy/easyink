import type { Selection, SelectionStore } from '@easyink/core'
import { shallowRef } from 'vue'

/**
 * Reactive SelectionStore implementation.
 * Uses Vue shallowRef so that computed properties in PropertiesPanel,
 * SelectionOverlay, etc. re-evaluate when selection changes.
 * Validates JSON-safety on set().
 */
export function createSelectionStore(): SelectionStore {
  const _selection = shallowRef<Selection | null>(null)

  function validateJsonSafe(payload: unknown): void {
    const json = JSON.stringify(payload)
    if (json === undefined) {
      throw new Error('Selection payload is not JSON-serializable')
    }
    const roundTripped = JSON.parse(json)
    if (JSON.stringify(roundTripped) !== json) {
      throw new Error('Selection payload failed JSON round-trip validation')
    }
  }

  return {
    get selection(): Selection | null {
      return _selection.value
    },

    set(selection: Selection | null): void {
      if (selection) {
        try {
          validateJsonSafe(selection.payload)
          if (selection.anchor !== undefined) {
            validateJsonSafe(selection.anchor)
          }
        }
        catch (err) {
          // Boundary policy: surface the diagnostic loudly but do NOT throw
          // into Vue's reactive effect chain. A throw here would leave any
          // upstream watcher in a half-applied state and (depending on Vue's
          // scheduler) silently break further selection updates. Instead we
          // log + drop the bad payload so the user sees "selection cleared"
          // rather than a frozen UI.
          console.error('[SelectionStore] Rejected non-JSON-safe selection:', err, selection)
          _selection.value = null
          return
        }
      }
      _selection.value = selection
    },
  }
}
