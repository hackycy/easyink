import type { GeometryService, MaterialDesignerExtension, MaterialGeometry, TransactionAPI } from '@easyink/core'
import type { MaterialNode } from '@easyink/schema'
import { describe, expect, it } from 'vitest'
import { EditingSession } from './editing-session'
import { createSelectionStore } from './selection-store'

function makeSession() {
  const node: MaterialNode = {
    id: 'n1',
    type: 'test',
    x: 0,
    y: 0,
    width: 100,
    height: 50,
    props: {},
  } as MaterialNode

  const materialGeometry: MaterialGeometry = {
    getContentLayout: () => ({ contentBox: { x: 0, y: 0, width: 100, height: 50 } }),
    resolveLocation: () => [],
    hitTest: () => null,
  }

  const extension: MaterialDesignerExtension = {
    renderContent: () => () => {},
    geometry: materialGeometry,
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
})
