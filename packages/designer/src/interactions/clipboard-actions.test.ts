import type { MaterialNode, PageSchema } from '@easyink/schema'
import { recordSchemaAdapter } from '@easyink/core'
import { createTestCompiledMaterialProfile, createTestMaterialManifest } from '@easyink/core/testing'
import { describe, expect, it, vi } from 'vitest'
import { DesignerStore } from '../store/designer-store'
import { createClipboardActions } from './clipboard-actions'

function makeNode(id: string, x = 0, y = 0): MaterialNode {
  return {
    id,
    type: 'rect',
    x,
    y,
    width: 50,
    height: 50,
    modelVersion: 1,
    model: {},
    slots: {},
    bindings: {},
    output: { visibility: 'include' },
  }
}

function makeStore(elements: MaterialNode[], selected: string[] = [], page: PageSchema = { mode: 'fixed', width: 1000, height: 1000 }, profile = createTestCompiledMaterialProfile([createTestMaterialManifest({ type: 'rect' })])): DesignerStore {
  const store = new DesignerStore({
    unit: 'px',
    page,
    guides: { x: [], y: [] },
    elements,
  }, undefined, undefined, { materials: { profile } })

  if (selected.length > 0)
    store.selection.selectMultiple(selected)

  return store
}

describe('createClipboardActions', () => {
  it('rolls back a failed cut transaction and keeps selection intact', () => {
    const node = makeNode('node-1')
    const store = makeStore([node], ['node-1'])
    const actions = createClipboardActions(store, () => [node])

    vi.spyOn(store.documentTransactions, 'transact').mockImplementation(() => {
      throw new Error('cut failed')
    })

    expect(() => actions.cutSelection()).toThrow('cut failed')
    expect(store.documentTransactions.transact).toHaveBeenCalledOnce()
    expect(store.selection.ids).toEqual(['node-1'])
    expect(store.clipboard).toHaveLength(1)
  })

  it('rolls back a failed paste transaction without changing selection', () => {
    const node = makeNode('copy-source', 10, 20)
    const store = makeStore([])
    const actions = createClipboardActions(store, () => [])

    store.clipboard = [node]
    vi.spyOn(store.documentTransactions, 'transact').mockImplementation(() => {
      throw new Error('paste failed')
    })

    expect(() => actions.pasteClipboard()).toThrow('paste failed')
    expect(store.documentTransactions.transact).toHaveBeenCalledOnce()
    expect(store.selection.ids).toEqual([])
  })

  it('skips locked nodes when deleting selection', () => {
    const locked = { ...makeNode('locked'), editorState: { locked: true } }
    const unlocked = makeNode('open')
    const store = makeStore([locked, unlocked], ['locked', 'open'])
    const actions = createClipboardActions(store, () => [locked, unlocked])
    actions.deleteSelection()

    expect(store.documentTransactions.historyEntries).toHaveLength(1)
  })

  it('duplicates continuously across fixed-sheet page breaks', () => {
    const node = makeNode('node-1', 80, 80)
    const store = makeStore([node], ['node-1'], {
      mode: 'fixed',
      width: 100,
      height: 100,
      pagination: { strategy: 'fixed-sheets', pageCount: 2 },
    })
    const actions = createClipboardActions(store, () => [node])

    actions.duplicateSelection()

    expect(store.schema.elements).toHaveLength(2)
    expect(store.schema.elements[1]).toMatchObject({ x: 90, y: 90 })
  })

  it('preserves copied IDs but generates unique fallback IDs for duplicate and paste', () => {
    const first = { ...makeNode('first'), slots: {} }
    const second = makeNode('second')
    const store = makeStore([first, second], ['first', 'second'])
    const actions = createClipboardActions(store, () => [first, second])

    actions.copySelection()
    expect(store.clipboard.map(node => node.id)).toEqual(['first', 'second'])
    expect(store.clipboard[0]!.id).toBe('first')

    actions.duplicateSelection()
    actions.pasteClipboard()

    const ids: string[] = []
    const stack = [...store.schema.elements]
    while (stack.length > 0) {
      const node = stack.pop()!
      ids.push(node.id)
      Object.values(node.slots).forEach(children => stack.push(...children))
    }
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('rekeys references across duplicated roots with one identity map', () => {
    const adapter = {
      ...recordSchemaAdapter(1),
      introspect: (node: MaterialNode) => ({
        identities: [],
        structures: [],
        resources: [],
        bindings: [],
        references: typeof node.model.peerId === 'string'
          ? [{
              path: '/model/peerId' as const,
              location: 'value' as const,
              value: node.model.peerId,
              target: { scope: 'document' as const, kind: 'node' },
              required: true,
            }]
          : [],
      }),
    }
    const profile = createTestCompiledMaterialProfile([
      createTestMaterialManifest({ type: 'reference-box', schemaAdapter: adapter }),
    ])
    const first = profile.createNode('reference-box', { id: 'a', model: { peerId: 'b' } })
    const second = profile.createNode('reference-box', { id: 'b', model: { peerId: 'a' } })
    const store = makeStore([first, second], ['a', 'b'], undefined, profile)
    const actions = createClipboardActions(store, () => [first, second], profile)

    actions.duplicateSelection()

    const duplicates = store.schema.elements.slice(2)
    expect(duplicates).toHaveLength(2)
    expect(duplicates[0]!.model.peerId).toBe(duplicates[1]!.id)
    expect(duplicates[1]!.model.peerId).toBe(duplicates[0]!.id)
  })

  it('rejects an invalid selection atomically before starting a paste transaction', () => {
    const profile = createTestCompiledMaterialProfile()
    const store = makeStore([])
    const actions = createClipboardActions(store, () => [], profile)
    store.clipboard = [makeNode('unknown')]

    expect(() => actions.pasteClipboard()).toThrow('MATERIAL_TYPE_UNKNOWN')
    expect(store.documentTransactions.historyEntries).toHaveLength(0)
    expect(store.schema.elements).toEqual([])
  })
})
