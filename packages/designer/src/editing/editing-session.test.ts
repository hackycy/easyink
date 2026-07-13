import type { DocumentStoreEvent, GeometryService, MaterialDesignerExtension, MaterialGeometry, SelectionType, TransactionAPI } from '@easyink/core'
import type { MaterialNode } from '@easyink/schema'
import { createTestMaterialManifest } from '@easyink/core/testing'
import { describe, expect, it, vi } from 'vitest'
import { DesignerStore } from '../store/designer-store'
import { createDesignerTestProfile } from '../testing/material-profile'
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
    path: Object.freeze([Object.freeze({ nodeId: node.id, parentNodeId: null, slot: null })]),
    extension,
    selectionStore,
    geometry: {} as GeometryService,
    materialGeometry,
    tx: {} as TransactionAPI,
    getNode: () => node,
  })

  return { session, selectionStore }
}

function editableExtension(selectionTypes?: SelectionType[]): MaterialDesignerExtension {
  return {
    renderContent: () => () => {},
    geometry: {
      getContentLayout: node => ({ contentBox: { x: 0, y: 0, width: node.width, height: node.height } }),
      resolveLocation: () => [],
      hitTest: () => null,
    },
    selectionTypes,
  }
}

function editingStore(selectionTypes?: SelectionType[]) {
  const extension = editableExtension(selectionTypes)
  const profile = createDesignerTestProfile([
    createTestMaterialManifest({
      type: 'container',
      slots: [{ id: 'content', key: { kind: 'exact', value: 'content' }, coordinateSpace: 'owner', layoutParticipation: 'owner', reparent: 'allowed' }],
      designer: () => ({ extension, catalog: { group: 'test', order: 0 } }),
    }),
  ])
  const child = profile.createNode('container', { id: 'child' })
  const owner = profile.createNode('container', { id: 'owner', slots: { content: [child] } })
  const other = profile.createNode('container', { id: 'other', slots: { content: [] } })
  const store = new DesignerStore({ elements: [owner, other] }, undefined, undefined, { materials: { profile } })
  return { store, extension }
}

describe('editingSession', () => {
  it('pushes descendants with frozen stable paths and pops one frame at a time', () => {
    const { store, extension } = editingStore()
    const root = store.editingSession.enter('owner', extension)!
    const child = store.editingSession.push('child', extension)!

    expect(root.path.map(entry => entry.nodeId)).toEqual(['owner'])
    expect(child.path.map(entry => entry.nodeId)).toEqual(['owner', 'child'])
    expect(Object.isFrozen(child.path)).toBe(true)
    expect(child.path.every(Object.isFrozen)).toBe(true)

    store.editingSession.pop()
    expect(store.editingSession.activeNodeId).toBe('owner')
    store.editingSession.pop()
    expect(store.editingSession.isActive).toBe(false)
  })

  it('rejects a push that is not a descendant of the active frame', () => {
    const { store, extension } = editingStore()
    store.editingSession.enter('owner', extension)
    expect(store.editingSession.push('other', extension)).toBeNull()
    expect(store.editingSession.activeNodeId).toBe('owner')
  })

  it('destroys every frame in reverse order on exitAll', () => {
    const { store, extension } = editingStore()
    const root = store.editingSession.enter('owner', extension)!
    const child = store.editingSession.push('child', extension)!
    const order: string[] = []
    const destroyRoot = root.destroy.bind(root)
    const destroyChild = child.destroy.bind(child)
    vi.spyOn(root, 'destroy').mockImplementation(() => {
      order.push('owner')
      destroyRoot()
    })
    vi.spyOn(child, 'destroy').mockImplementation(() => {
      order.push('child')
      destroyChild()
    })

    store.editingSession.exitAll()

    expect(order).toEqual(['child', 'owner'])
  })

  it('destroys a deleted suffix and exits when the root frame is deleted', async () => {
    const { store, extension } = editingStore()
    const root = store.editingSession.enter('owner', extension)!
    const child = store.editingSession.push('child', extension)!
    const rootDestroy = vi.spyOn(root, 'destroy')
    const childDestroy = vi.spyOn(child, 'destroy')

    store.documentTransactions.transact((draft) => {
      draft.elements[0]!.slots.content.splice(0, 1)
    }, { label: 'Delete child', operation: {
      kind: 'structure.remove',
      sessionPath: ['owner', 'child'],
      targetIds: ['node:child'],
      fieldPaths: ['/slots/content'],
      selectionLineage: child.selectionStore.lineageId,
      structural: true,
    } })
    await Promise.resolve()
    expect(store.editingSession.activeNodeId).toBe('owner')
    expect(childDestroy).toHaveBeenCalledOnce()
    expect(rootDestroy).not.toHaveBeenCalled()

    store.documentTransactions.transact((draft) => {
      draft.elements.splice(0, 1)
    }, { label: 'Delete owner', operation: {
      kind: 'structure.remove',
      sessionPath: ['owner'],
      targetIds: ['node:owner'],
      fieldPaths: ['/elements'],
      selectionLineage: root.selectionStore.lineageId,
      structural: true,
    } })
    await Promise.resolve()
    expect(store.editingSession.isActive).toBe(false)
    expect(rootDestroy).toHaveBeenCalledOnce()
  })

  it('drops a child frame reparented away while rebasing the surviving root path', async () => {
    const { store, extension } = editingStore()
    const root = store.editingSession.enter('owner', extension)!
    const child = store.editingSession.push('child', extension)!
    const childDestroy = vi.spyOn(child, 'destroy')

    store.documentTransactions.transact((draft) => {
      const moved = draft.elements[0]!.slots.content.splice(0, 1)[0]!
      draft.elements[1]!.slots.content.push(moved)
    }, { label: 'Reparent child', operation: {
      kind: 'structure.reparent',
      sessionPath: ['owner', 'child'],
      targetIds: ['node:child', 'node:other'],
      fieldPaths: ['/slots/content'],
      selectionLineage: child.selectionStore.lineageId,
      structural: true,
    } })
    await Promise.resolve()

    expect(store.editingSession.activeSession).toBe(root)
    expect(root.path.map(entry => entry.nodeId)).toEqual(['owner'])
    expect(childDestroy).toHaveBeenCalledOnce()
  })

  it('rebases every surviving frame selection with the exact committed event context', async () => {
    const contexts: unknown[] = []
    const selectionType: SelectionType = {
      id: 'container.part',
      resolveLocation: () => [],
      rebase: (selection, context) => {
        contexts.push(context)
        return selection
      },
    }
    const { store, extension } = editingStore([selectionType])
    const root = store.editingSession.enter('owner', extension)!
    const child = store.editingSession.push('child', extension)!
    root.selectionStore.set({ type: 'container.part', nodeId: 'owner', payload: { id: 'root-part' } })
    child.selectionStore.set({ type: 'container.part', nodeId: 'child', payload: { id: 'child-part' } })
    const events: DocumentStoreEvent[] = []
    store.documentStore.subscribe((event) => {
      if (event.kind === 'commit' || event.kind === 'undo' || event.kind === 'redo')
        events.push(event)
    })

    store.documentTransactions.run('owner', (draft) => {
      draft.x = 20
    }, { label: 'Move owner' })
    await Promise.resolve()

    expect(contexts).toHaveLength(2)
    expect(contexts[0]).toMatchObject({
      changeSet: events[0]!.changeSet,
      before: events[0]!.previousIndex,
      after: events[0]!.index,
    })
    expect(contexts[1]).toEqual(contexts[0])

    store.documentTransactions.undo()
    await Promise.resolve()
    store.documentTransactions.redo()
    await Promise.resolve()

    expect(contexts).toHaveLength(6)
    expect(contexts[2]).toMatchObject({ changeSet: events[1]!.changeSet, before: events[1]!.previousIndex, after: events[1]!.index })
    expect(contexts[4]).toMatchObject({ changeSet: events[2]!.changeSet, before: events[2]!.previousIndex, after: events[2]!.index })
  })

  it('marks barriers and cancels gestures before every successful stack transition', () => {
    const { store, extension } = editingStore()
    store.selection.select('owner')
    const barrier = vi.spyOn(store.documentTransactions, 'markHistoryBarrier')
    const cancel = vi.fn()
    store.editingSession.setCancelActiveGesture(cancel)

    store.editingSession.enter('owner', extension)
    store.editingSession.push('child', extension)
    store.editingSession.pop()
    store.editingSession.exitAll()

    expect(cancel).toHaveBeenCalledTimes(4)
    expect(barrier).toHaveBeenCalledTimes(4)
  })
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
