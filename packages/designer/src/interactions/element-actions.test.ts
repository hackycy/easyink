import type { MaterialNode } from '@easyink/schema'
import { createTestCompiledMaterialProfile, createTestMaterialManifest } from '@easyink/core/testing'
import { describe, expect, it } from 'vitest'
import { DesignerStore } from '../store/designer-store'
import { deleteMaterialNodes, toggleMaterialHidden } from './element-actions'

function makeNode(id: string, input: Partial<MaterialNode> = {}): MaterialNode {
  return {
    id,
    type: 'rect',
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    modelVersion: 1,
    model: {},
    slots: {},
    bindings: {},
    output: { visibility: 'include' },
    ...input,
  } as MaterialNode
}

function makeStore(elements: MaterialNode[], selected: string[] = []): DesignerStore {
  const profile = createTestCompiledMaterialProfile([createTestMaterialManifest({ type: 'rect' })])
  const store = new DesignerStore({
    unit: 'px',
    page: { mode: 'fixed', width: 100, height: 100 },
    guides: { x: [], y: [] },
    elements,
  }, undefined, undefined, { materials: { profile } })
  if (selected.length > 0)
    store.selection.selectMultiple(selected)
  return store
}

describe('element actions', () => {
  it('toggles hidden state through an undoable transaction', () => {
    const node = makeNode('a')
    const store = makeStore([node])
    const liveNode = store.getElementById('a')!

    expect(toggleMaterialHidden(store, liveNode)).toBe(true)

    expect(store.getElementById('a')?.editorState?.hidden).toBe(true)
    expect(store.documentTransactions.historyEntries).toHaveLength(1)
    store.documentTransactions.undo()
    expect(store.getElementById('a')?.editorState?.hidden).toBeUndefined()
  })

  it('deletes hidden unlocked nodes and removes them from selection', () => {
    const hidden = makeNode('hidden', { editorState: { hidden: true } })
    const locked = makeNode('locked', { editorState: { locked: true } })
    const store = makeStore([hidden, locked], ['hidden', 'locked'])

    expect(deleteMaterialNodes(store, [store.getElementById('hidden')!, store.getElementById('locked')!])).toBe(1)

    expect(store.schema.elements.map(node => node.id)).toEqual(['locked'])
    expect(store.selection.ids).toEqual(['locked'])
    expect(store.documentTransactions.historyEntries).toHaveLength(1)
  })
})
