import type { Selection, SelectionStore } from '@easyink/core'
import type { DiagnosticsChannel } from '../store/diagnostics'
import { shallowRef } from 'vue'

/**
 * Reactive SelectionStore implementation.
 *
 * Reactivity: backed by `shallowRef`, so PropertiesPanel / SelectionOverlay
 * computed effects re-evaluate when selection changes.
 *
 * Recoverable-error policy (audit/202605011431.md item 4)
 * --------------------------------------------------------
 * On a non-JSON-safe payload, instead of clearing the selection wholesale
 * (which dumps the user's edit context — the "half-failed UI state" the
 * audit calls out), we:
 *
 * 1. Record the rejected payload to the designer-level diagnostics channel
 *    so the DebugPanel and any host Contribution observe it.
 * 2. Roll back to the most recently accepted Selection (`_lastValid`),
 *    which preserves the user's last good state.
 *
 * The rollback intentionally only fires for *invalid* payloads. Programmatic
 * `set(null)`, user-initiated clearing, page switches and so on still flow
 * through normally — they reset `_lastValid` themselves.
 */
export function createSelectionStore(diagnostics?: DiagnosticsChannel): SelectionStore {
  const _selection = shallowRef<Selection | null>(null)
  let _lastValid: Selection | null = null

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
          // Boundary policy: surface a structured diagnostic AND keep the
          // last valid selection. Throwing into Vue's reactive effect chain
          // would leave upstream watchers in a half-applied state; clearing
          // would lose the user's edit context.
          if (diagnostics) {
            diagnostics.push({
              source: 'selection-store',
              severity: 'error',
              message: 'Rejected non-JSON-safe selection payload; rolled back to last valid selection',
              detail: {
                error: err instanceof Error ? err.message : String(err),
                rejectedType: selection.type,
                hadLastValid: _lastValid !== null,
              },
            })
          }
          else {
            // No diagnostics channel attached (legacy callers): keep the
            // failure observable so the bug is not silent.
            console.error('[SelectionStore] Rejected non-JSON-safe selection:', err, selection)
          }
          _selection.value = _lastValid
          return
        }
      }
      _selection.value = selection
      _lastValid = selection
    },
  }
}
