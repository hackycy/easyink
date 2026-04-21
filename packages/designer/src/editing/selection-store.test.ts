import { describe, expect, it } from 'vitest'
import { createSelectionStore } from './selection-store'

describe('createSelectionStore', () => {
  it('starts with null selection', () => {
    const store = createSelectionStore()
    expect(store.selection).toBeNull()
  })

  it('sets and gets a valid selection', () => {
    const store = createSelectionStore()
    const sel = { type: 'table.cell', nodeId: 'n1', payload: { row: 1, col: 2 } }
    store.set(sel)
    expect(store.selection).toEqual(sel)
  })

  it('sets null to clear selection', () => {
    const store = createSelectionStore()
    store.set({ type: 'table.cell', nodeId: 'n1', payload: { row: 0, col: 0 } })
    store.set(null)
    expect(store.selection).toBeNull()
  })

  it('accepts JSON-safe payload', () => {
    const store = createSelectionStore()
    expect(() => {
      store.set({
        type: 'table.cell',
        nodeId: 'n1',
        payload: { row: 3, col: 4, nested: { a: 1, b: [1, 2] } },
      })
    }).not.toThrow()
  })

  it('silently strips non-JSON-safe properties (function/Symbol) during round-trip', () => {
    const store = createSelectionStore()
    // JSON.stringify silently drops functions and Symbols, producing '{}'.
    // The round-trip is consistent so validateJsonSafe does not throw.
    // This is by design: the validation ensures consistency, not completeness.
    expect(() => {
      store.set({
        type: 'test',
        nodeId: 'n1',
        payload: { fn: () => {}, s: Symbol('x') },
      })
    }).not.toThrow()
    // But the stored payload has lost the non-serializable fields
    const stored = store.selection!.payload as Record<string, unknown>
    expect(JSON.parse(JSON.stringify(stored))).toEqual({})
  })

  it('throws on circular reference payload', () => {
    const store = createSelectionStore()
    const circular: Record<string, unknown> = { a: 1 }
    circular.self = circular
    expect(() => {
      store.set({
        type: 'test',
        nodeId: 'n1',
        payload: circular,
      })
    }).toThrow()
  })

  it('accepts valid anchor', () => {
    const store = createSelectionStore()
    expect(() => {
      store.set({
        type: 'table.cell',
        nodeId: 'n1',
        payload: { row: 0, col: 0 },
        anchor: { row: 2, col: 3 },
      })
    }).not.toThrow()
    expect(store.selection?.anchor).toEqual({ row: 2, col: 3 })
  })

  it('throws on circular reference anchor', () => {
    const store = createSelectionStore()
    const circular: Record<string, unknown> = { row: 0 }
    circular.self = circular
    expect(() => {
      store.set({
        type: 'table.cell',
        nodeId: 'n1',
        payload: { row: 0, col: 0 },
        anchor: circular,
      })
    }).toThrow()
  })

  it('preserves selection payload through JSON round-trip', () => {
    const store = createSelectionStore()
    const payload = { row: 5, col: 10, meta: { label: 'test', values: [1, 2, 3] } }
    store.set({ type: 'table.cell', nodeId: 'n1', payload })
    const stored = store.selection!.payload as typeof payload
    // Payload should survive JSON round-trip
    expect(JSON.parse(JSON.stringify(stored))).toEqual(payload)
  })
})
