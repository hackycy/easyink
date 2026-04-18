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
        validateJsonSafe(selection.payload)
        if (selection.anchor !== undefined) {
          validateJsonSafe(selection.anchor)
        }
      }
      _selection.value = selection
    },
  }
}
