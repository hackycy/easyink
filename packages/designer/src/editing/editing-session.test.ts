import type { GeometryService, MaterialDesignerExtension, MaterialGeometry, SelectionType, TransactionAPI } from '@easyink/core'
import type { MaterialNode } from '@easyink/schema'
import { describe, expect, it, vi } from 'vitest'
import { EditingSession } from './editing-session'
import { createSelectionStore } from './selection-store'

function makeSession(selectionTypes?: SelectionType[]) {
  const node: MaterialNode = {
    id: 'n1',
    type: 'test',
    x: 0,
    y: 0,
    width: 100,
    height: 50,
    modelVersion: 1,
    model: {},
    slots: {},
    bindings: {},
    output: { visibility: 'include' },
  }

  const materialGeometry: MaterialGeometry = {
    getContentLayout: () => ({ contentBox: { x: 0, y: 0, width: 100, height: 50 } }),
    resolveLocation: () => [],
    hitTest: () => null,
  }

  const extension: MaterialDesignerExtension = {
    renderContent: () => () => {},
    geometry: materialGeometry,
    selectionTypes,
  }

  const selectionStore = createSelectionStore()
  const session = new EditingSession({
    nodeId: node.id,
    extension,
    selectionStore,
    geometry: {} as GeometryService,
    materialGeometry,
    tx: {} as TransactionAPI,
    getNode: () => node,
  })

  return { session, selectionStore }
}

describe('editingSession', () => {
  it('clears selection-scoped meta after the selection changes away', () => {
    const { session, selectionStore } = makeSession()
    const first = { type: 'table.cell', nodeId: 'n1', payload: { row: 0, col: 0 } }

    selectionStore.set(first)
    session.setSelectionScopedMeta('editingCell', { row: 0, col: 0 })
    expect(session.meta.editingCell).toEqual({ row: 0, col: 0 })

    selectionStore.set({ type: 'table.cell', nodeId: 'n1', payload: { row: 0, col: 1 } })
    expect(session.meta.editingCell).toBeUndefined()

    selectionStore.set(first)
    expect(session.meta.editingCell).toBeUndefined()
  })

  it('keeps plain session meta across selection changes', () => {
    const { session, selectionStore } = makeSession()

    selectionStore.set({ type: 'svg-star.control', nodeId: 'n1', payload: { handle: 'inner-radius', index: 0 } })
    session.setMeta('starInnerRatio', 0.42)
    selectionStore.set({ type: 'svg-star.control', nodeId: 'n1', payload: { handle: 'inner-radius', index: 1 } })

    expect(session.meta.starInnerRatio).toBe(0.42)
  })

  it('rebases active selections through their registered selection type', () => {
    const rebase = vi.fn(selection => ({
      ...selection,
      payload: { row: 0, col: 0 },
    }))
    const selectionType: SelectionType = {
      id: 'table.cell',
      resolveLocation: () => [],
      rebasePropertyChange: rebase,
    }
    const { session, selectionStore } = makeSession([selectionType])
    const before = { id: 'n1' } as MaterialNode
    const after = { id: 'n1' } as MaterialNode

    selectionStore.set({ type: 'table.cell', nodeId: 'n1', payload: { row: 2, col: 0 } })
    session.setSelectionScopedMeta('editingCell', { row: 2, col: 0 })
    session.rebaseSelection(before, after, { type: 'table.cell', hint: { removedRow: 'footer' } })

    expect(rebase).toHaveBeenCalledWith(
      { type: 'table.cell', nodeId: 'n1', payload: { row: 2, col: 0 } },
      before,
      after,
      { removedRow: 'footer' },
    )
    expect(selectionStore.selection?.payload).toEqual({ row: 0, col: 0 })
    expect(session.meta.editingCell).toBeUndefined()
  })

  it('keeps selection-scoped meta when semantic identity and coordinates are preserved', () => {
    const selectionType: SelectionType = {
      id: 'table.cell',
      resolveLocation: () => [],
      rebasePropertyChange: selection => ({ ...selection }),
    }
    const { session, selectionStore } = makeSession([selectionType])
    const selection = { type: 'table.cell', nodeId: 'n1', payload: { row: 0, col: 0 } }

    selectionStore.set(selection)
    session.setSelectionScopedMeta('editingCell', { buffer: 'header value' })
    session.rebaseSelection({ id: 'n1' } as MaterialNode, { id: 'n1' } as MaterialNode, {
      type: 'table.cell',
      hint: {},
    })

    expect(selectionStore.selection).toEqual(selection)
    expect(session.meta.editingCell).toEqual({ buffer: 'header value' })
  })

  it('clears selection-scoped meta when semantic identity changes at the same coordinates', () => {
    const selectionType: SelectionType = {
      id: 'table.cell',
      resolveLocation: () => [],
      rebasePropertyChange: selection => ({ selection: { ...selection }, identityChanged: true }),
    }
    const { session, selectionStore } = makeSession([selectionType])
    const selection = { type: 'table.cell', nodeId: 'n1', payload: { row: 0, col: 0 } }

    selectionStore.set(selection)
    session.setSelectionScopedMeta('editingCell', { buffer: 'header value' })
    session.setMeta('plainState', 'preserved')
    const invalidated = vi.fn(() => {
      expect(session.meta.editingCell).toEqual({ buffer: 'header value' })
    })
    session.onSelectionInvalidated(invalidated)
    session.rebaseSelection({ id: 'n1' } as MaterialNode, { id: 'n1' } as MaterialNode, {
      type: 'table.cell',
      hint: { removedRow: 'header' },
    })

    expect(selectionStore.selection).toEqual(selection)
    expect(invalidated).toHaveBeenCalledWith({ reason: 'identity-changed' })
    expect(session.meta.editingCell).toBeUndefined()
    expect(session.meta.plainState).toBe('preserved')
  })
})
