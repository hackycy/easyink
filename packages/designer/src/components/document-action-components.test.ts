import { createTestCompiledMaterialProfile, createTestMaterialManifest } from '@easyink/core/testing'
import { describe, expect, it } from 'vitest'
import { appendDocumentNodes, createDesignerDocumentOperation, removeDocumentNodes, updateDraftNodeModel } from '../editing/document-recipes'
import { DesignerStore } from '../store/designer-store'

describe('document action component recipes', () => {
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
})
