import type { Selection, SelectionRebaseContext, SelectionStore, SelectionType } from '@easyink/core'
import type { JsonValue } from '@easyink/shared'
import type { DiagnosticsChannel } from '../store/diagnostics'
import { assertJsonValue, generateId } from '@easyink/shared'
import { shallowRef } from 'vue'

/** Reactive, JSON-safe selection state with stable lineage across internal rebases. */
export function createSelectionStore(diagnostics?: DiagnosticsChannel): SelectionStore {
  const selectionRef = shallowRef<Selection | null>(null)
  let lastValid: Selection | null = null
  let lineageId = generateId('selection')
  const listeners = new Set<() => void>()

  function validateSelection(selection: Selection): void {
    assertJsonValue(selection.payload)
    if (selection.anchor !== undefined)
      assertJsonValue(selection.anchor)
  }

  function reportRejected(error: unknown, selection: Selection, action: 'set' | 'rebase'): void {
    if (diagnostics) {
      diagnostics.push({
        source: 'selection-store',
        severity: 'error',
        message: `Rejected invalid selection ${action}; rolled back to last valid selection`,
        detail: {
          error: error instanceof Error ? error.message : String(error),
          rejectedType: selection.type,
          hadLastValid: lastValid !== null,
        },
      })
      return
    }
    console.error(`[SelectionStore] Rejected selection ${action}:`, error, selection)
  }

  function accept(selection: Selection | null, preserveLineage: boolean): void {
    const changed = !sameSelection(selectionRef.value, selection)
    selectionRef.value = selection
    lastValid = selection
    if (!changed)
      return
    if (!preserveLineage)
      lineageId = generateId('selection')
    for (const listener of listeners)
      listener()
  }

  return {
    get selection(): Selection | null {
      return selectionRef.value
    },

    get lineageId(): string {
      return lineageId
    },

    set(selection: Selection | null): void {
      if (selection) {
        try {
          validateSelection(selection)
        }
        catch (error) {
          reportRejected(error, selection, 'set')
          selectionRef.value = lastValid
          return
        }
      }
      accept(selection, false)
    },

    rebase<T extends JsonValue>(context: SelectionRebaseContext, type?: SelectionType<T>): void {
      const current = selectionRef.value
      if (!current)
        return
      if (!context.after.hasNode(current.nodeId)) {
        accept(null, false)
        return
      }
      if (!type?.rebase || type.id !== current.type)
        return
      try {
        const next = type.rebase(current as Selection<T>, context)
        if (next)
          validateSelection(next)
        accept(next, next !== null)
      }
      catch (error) {
        reportRejected(error, current, 'rebase')
        selectionRef.value = lastValid
      }
    },

    onChange(listener: () => void): () => void {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

function sameSelection(left: Selection | null, right: Selection | null): boolean {
  if (left === right)
    return true
  if (!left || !right || left.type !== right.type || left.nodeId !== right.nodeId)
    return false
  return sameJsonValue(left.payload, right.payload) && sameJsonValue(left.anchor, right.anchor)
}

function sameJsonValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right))
    return true
  if (typeof left !== 'object' || left === null || typeof right !== 'object' || right === null)
    return false
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length
      && left.every((value, index) => sameJsonValue(value, right[index]))
  }
  const leftRecord = left as Record<string, unknown>
  const rightRecord = right as Record<string, unknown>
  const leftKeys = Object.keys(leftRecord)
  const rightKeys = Object.keys(rightRecord)
  return leftKeys.length === rightKeys.length && leftKeys.every(key => Object.hasOwn(rightRecord, key)
    && sameJsonValue(leftRecord[key], rightRecord[key]))
}
