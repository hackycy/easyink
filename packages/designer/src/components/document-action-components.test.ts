/** @vitest-environment happy-dom */
import { createTestCompiledMaterialProfile, createTestMaterialManifest } from '@easyink/core/testing'
import { describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick } from 'vue'
import { provideDesignerStore } from '../composables'
import { addDraftElementGroup, alignDraftNodes, appendDocumentNodes, createDesignerDocumentOperation, distributeDraftNodesHorizontally, escapeDocumentPathToken, moveDraftNodesLayer, removeDocumentNodes, removeDraftElementGroups, updateDraftNodeModel } from '../editing/document-recipes'
import { DesignerStore } from '../store/designer-store'
import MaterialPanel from './MaterialPanel.vue'

describe('document action component recipes', () => {
  it('mounts MaterialPanel and commits its add handler as one undoable transaction', async () => {
    const profile = createTestCompiledMaterialProfile([createTestMaterialManifest({ type: 'rect', designer: true })])
    const store = new DesignerStore({ elements: [] }, undefined, undefined, { materials: { profile } })
    const host = document.createElement('div')
    const app = createApp(defineComponent({
      setup() {
        provideDesignerStore(store)
        return () => h(MaterialPanel)
      },
    }))
    app.mount(host)
    await nextTick()

    ;(host.querySelector('button') as HTMLButtonElement).dispatchEvent(new PointerEvent('pointerup', { bubbles: true }))
    await nextTick()
    expect(store.schema.elements).toHaveLength(1)
    expect(store.documentTransactions.historyEntries).toHaveLength(1)
    store.documentTransactions.undo()
    expect(store.schema.elements).toHaveLength(0)
    app.unmount()
  })

  it('commits a compound action as one immutable history item and undo restores all changes', () => {
    const profile = createTestCompiledMaterialProfile([createTestMaterialManifest({ type: 'rect' })])
    const store = new DesignerStore({ elements: [] }, undefined, undefined, { materials: { profile } })
    const node = profile.createNode('rect', { id: 'new-node', model: { text: 'before' } })
    const before = store.schema

    store.documentTransactions.transact((draft) => {
      appendDocumentNodes(draft, [node])
      updateDraftNodeModel(draft, store, node.id, { text: 'after' })
    }, {
      label: 'Compound action',
      operation: createDesignerDocumentOperation(store, 'component.compound', ['node:new-node'], ['/elements', '/model/text'], true),
    })

    expect(store.schema).not.toBe(before)
    expect(store.documentTransactions.historyEntries).toHaveLength(1)
    expect(store.getElementById('new-node')?.model.text).toBe('after')
    store.documentTransactions.undo()
    expect(store.schema.elements).toHaveLength(0)
  })

  it('removes a nested slot subtree and its group atomically, then restores both with one undo', () => {
    const profile = createTestCompiledMaterialProfile()
    const child = profile.createNode('box', { id: 'child' })
    const owner = profile.createNode('container', { id: 'owner', slots: { content: [child] } })
    const store = new DesignerStore({ elements: [owner], groups: [{ id: 'group', memberIds: ['owner', 'child'] }] }, undefined, undefined, { materials: { profile } })

    store.documentTransactions.transact((draft) => {
      removeDocumentNodes(draft, ['child'])
    }, {
      label: 'Delete nested node',
      operation: createDesignerDocumentOperation(store, 'component.delete', ['node:child'], ['/elements'], true),
    })

    expect(store.documentTransactions.historyEntries).toHaveLength(1)
    expect(store.getElementById('child')).toBeUndefined()
    expect(store.schema.groups).toEqual([])
    store.documentTransactions.undo()
    expect(store.getElementById('child')).toBeDefined()
    expect(store.schema.groups).toEqual([{ id: 'group', memberIds: ['owner', 'child'] }])
  })

  it('escapes RFC6901 binding port tokens in operation metadata', () => {
    const profile = createTestCompiledMaterialProfile([createTestMaterialManifest({ type: 'rect' })])
    const store = new DesignerStore({ elements: [profile.createNode('rect', { id: 'node' })] }, undefined, undefined, { materials: { profile } })
    const port = 'flow-port:a/b~c'
    const transact = vi.spyOn(store.documentTransactions, 'transact')
    store.documentTransactions.transact((draft) => {
      draft.elements[0]!.model.changed = true
    }, {
      label: 'Bind dynamic port',
      operation: createDesignerDocumentOperation(store, 'binding.update', ['node:node'], [`/bindings/${escapeDocumentPathToken(port)}`], false),
    })
    expect(transact.mock.calls[0]?.[1].operation.fieldPaths).toEqual(['/bindings/flow-port:a~1b~0c'])
  })

  it('applies alignment, distribution, layering, and grouping through pure draft helpers', () => {
    const profile = createTestCompiledMaterialProfile([createTestMaterialManifest({ type: 'rect' })])
    const nodes = [
      profile.createNode('rect', { id: 'a', x: 0, width: 10, zIndex: 0 }),
      profile.createNode('rect', { id: 'b', x: 30, width: 10, zIndex: 1 }),
      profile.createNode('rect', { id: 'c', x: 100, width: 10, zIndex: 2 }),
    ]
    const store = new DesignerStore({ elements: nodes }, undefined, undefined, { materials: { profile } })
    store.documentTransactions.transact((draft) => {
      distributeDraftNodesHorizontally(draft, store, ['a', 'b', 'c'])
      alignDraftNodes(draft, store, ['a', 'b'], 'left')
      moveDraftNodesLayer(draft, store, ['a'], 'up')
      addDraftElementGroup(draft, { id: 'group', memberIds: ['a', 'b'] })
      removeDraftElementGroups(draft, ['missing'])
    }, { label: 'Pure helpers', operation: createDesignerDocumentOperation(store, 'test.helpers', ['node:a', 'node:b', 'node:c'], ['/x', '/zIndex', '/groups'], true) })

    expect(store.getElementById('a')).toMatchObject({ x: 0, zIndex: 2 })
    expect(store.getElementById('b')?.x).toBe(0)
    expect(store.schema.groups).toEqual([{ id: 'group', memberIds: ['a', 'b'] }])
  })
})
