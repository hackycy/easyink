import type { SelectionType } from '@easyink/core'
import { describe, expect, it, vi } from 'vitest'
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

  it.each([
    ['nested function', { nested: { fn: () => {} } }],
    ['nested undefined', { nested: { value: undefined } }],
    ['class instance', { nested: new (class Payload { value = 1 })() }],
    ['non-finite number', { nested: { value: Number.POSITIVE_INFINITY } }],
  ])('rejects %s and preserves the last valid selection and lineage', (_label, payload) => {
    const store = createSelectionStore()
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    store.set({ type: 'test', nodeId: 'n1', payload: { ok: true } })
    const lineage = store.lineageId

    store.set({ type: 'test', nodeId: 'n1', payload: payload as never })

    expect(store.selection).toEqual({ type: 'test', nodeId: 'n1', payload: { ok: true } })
    expect(store.lineageId).toBe(lineage)
    expect(errSpy).toHaveBeenCalled()
    errSpy.mockRestore()
  })

  it('rejects circular reference payload (rolls back to last valid + emits diagnostic, never throws)', () => {
    const diagnostics: Array<{ severity: string, source: string }> = []
    const store = createSelectionStore({
      push: (d: { severity: string, source: string }) => diagnostics.push(d),
    } as never)
    const circular: Record<string, unknown> = { a: 1 }
    circular.self = circular
    // Pre-seed with a valid selection to verify rejection rolls back to it
    // (audit/202605011431.md item 5: invalid payload preserves last valid
    // selection rather than silently nulling the user's working state).
    store.set({ type: 'test', nodeId: 'n1', payload: { ok: true } })
    expect(() => {
      store.set({
        type: 'test',
        nodeId: 'n1',
        payload: circular as never,
      })
    }).not.toThrow()
    expect(store.selection).toEqual({ type: 'test', nodeId: 'n1', payload: { ok: true } })
    expect(diagnostics.some(d => d.source === 'selection-store' && d.severity === 'error')).toBe(true)
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

  it('rejects circular reference anchor (logs + nulls selection, never throws)', () => {
    const store = createSelectionStore()
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const circular: Record<string, unknown> = { row: 0 }
    circular.self = circular
    expect(() => {
      store.set({
        type: 'table.cell',
        nodeId: 'n1',
        payload: { row: 0, col: 0 },
        anchor: circular as never,
      })
    }).not.toThrow()
    expect(store.selection).toBeNull()
    expect(errSpy).toHaveBeenCalled()
    errSpy.mockRestore()
  })

  it('preserves selection payload through JSON round-trip', () => {
    const store = createSelectionStore()
    const payload = { row: 5, col: 10, meta: { label: 'test', values: [1, 2, 3] } }
    store.set({ type: 'table.cell', nodeId: 'n1', payload })
    const stored = store.selection!.payload as typeof payload
    // Payload should survive JSON round-trip
    expect(JSON.parse(JSON.stringify(stored))).toEqual(payload)
  })

  it('notifies listeners on selection changes', () => {
    const store = createSelectionStore()
    const calls: Array<string | null> = []
    const dispose = store.onChange?.(() => {
      calls.push(store.selection?.type ?? null)
    })

    store.set({ type: 'table.cell', nodeId: 'n1', payload: { row: 0, col: 0 } })
    store.set(null)
    dispose?.()

    expect(calls).toEqual(['table.cell', null])
  })

  it('changes lineage only for accepted selection changes', () => {
    const store = createSelectionStore()
    const initial = store.lineageId
    const selection = { type: 'table.cell', nodeId: 'n1', payload: { row: 0, col: 0 } } as const
    store.set(selection)
    const selected = store.lineageId
    expect(selected).not.toBe(initial)

    store.set(selection)
    expect(store.lineageId).toBe(selected)

    store.set(null)
    expect(store.lineageId).not.toBe(selected)
  })

  it('rebases against exact indexes and preserves lineage when selection survives', () => {
    const store = createSelectionStore()
    store.set({ type: 'table.cell', nodeId: 'n1', payload: { cellId: 'a' }, anchor: { cellId: 'a' } })
    const lineage = store.lineageId
    const before = { hasNode: vi.fn(() => true) }
    const after = { hasNode: vi.fn(() => true) }
    const changeSet = { id: 'change-1' }
    const rebase = vi.fn(selection => ({ ...selection, payload: { cellId: 'b' }, anchor: { cellId: 'b' } }))
    const type: SelectionType<{ cellId: string }> = { id: 'table.cell', resolveLocation: () => [], rebase }

    store.rebase({ changeSet, before, after } as never, type)

    expect(rebase).toHaveBeenCalledWith(store.selection && expect.objectContaining({ payload: { cellId: 'a' } }), {
      changeSet,
      before,
      after,
    })
    expect(store.selection?.payload).toEqual({ cellId: 'b' })
    expect(store.lineageId).toBe(lineage)
  })

  it('clears missing nodes and creates a new lineage without calling the type', () => {
    const store = createSelectionStore()
    store.set({ type: 'table.cell', nodeId: 'deleted', payload: { cellId: 'a' } })
    const lineage = store.lineageId
    const rebase = vi.fn(selection => selection)
    const type: SelectionType<{ cellId: string }> = { id: 'table.cell', resolveLocation: () => [], rebase }

    store.rebase({
      changeSet: { id: 'change-1' },
      before: { hasNode: () => true },
      after: { hasNode: () => false },
    } as never, type)

    expect(store.selection).toBeNull()
    expect(store.lineageId).not.toBe(lineage)
    expect(rebase).not.toHaveBeenCalled()
  })

  it.each([
    ['throws', () => { throw new Error('rebase failed') }],
    ['returns invalid payload', (selection: any) => ({ ...selection, payload: { nested: { fn: () => {} } } })],
    ['returns invalid anchor', (selection: any) => ({ ...selection, anchor: { nested: undefined } })],
  ])('keeps the last valid selection and lineage when rebase %s', (_label, rebase) => {
    const store = createSelectionStore()
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    store.set({ type: 'table.cell', nodeId: 'n1', payload: { cellId: 'a' } })
    const selection = store.selection
    const lineage = store.lineageId

    store.rebase({
      changeSet: { id: 'change-1' },
      before: { hasNode: () => true },
      after: { hasNode: () => true },
    } as never, { id: 'table.cell', resolveLocation: () => [], rebase } as never)

    expect(store.selection).toBe(selection)
    expect(store.lineageId).toBe(lineage)
    expect(errSpy).toHaveBeenCalled()
    errSpy.mockRestore()
  })
})
