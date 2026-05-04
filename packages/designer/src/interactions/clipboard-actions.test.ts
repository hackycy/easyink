import type { MaterialNode } from '@easyink/schema'
import { describe, expect, it, vi } from 'vitest'
import { DesignerStore } from '../store/designer-store'
import { createClipboardActions } from './clipboard-actions'

function makeNode(id: string, x = 0, y = 0): MaterialNode {
  return { id, type: 'rect', x, y, width: 50, height: 50, props: {} } as MaterialNode
}

function makeStore(elements: MaterialNode[], selected: string[] = []): DesignerStore {
  const store = new DesignerStore({
    version: '1.0.0',
    unit: 'px',
    page: { mode: 'fixed', width: 1000, height: 1000 },
    guides: { x: [], y: [] },
    elements,
  })

  if (selected.length > 0)
    store.selection.selectMultiple(selected)

  vi.spyOn(store.commands, 'beginTransaction')
  vi.spyOn(store.commands, 'commitTransaction')
  vi.spyOn(store.commands, 'rollbackTransaction')

  return store
}

describe('createClipboardActions', () => {
  it('rolls back a failed cut transaction and keeps selection intact', () => {
    const node = makeNode('node-1')
    const store = makeStore([node], ['node-1'])
    const actions = createClipboardActions(store, () => [node])

    vi.spyOn(store.commands, 'execute').mockImplementation(() => {
      throw new Error('cut failed')
    })

    expect(() => actions.cutSelection()).toThrow('cut failed')
    expect(store.commands.beginTransaction).toHaveBeenCalledWith('Cut')
    expect(store.commands.commitTransaction).not.toHaveBeenCalled()
    expect(store.commands.rollbackTransaction).toHaveBeenCalledOnce()
    expect(store.selection.ids).toEqual(['node-1'])
    expect(store.clipboard).toHaveLength(1)
  })

  it('rolls back a failed paste transaction without changing selection', () => {
    const node = makeNode('copy-source', 10, 20)
    const store = makeStore([])
    const actions = createClipboardActions(store, () => [])

    store.clipboard = [node]
    vi.spyOn(store.commands, 'execute').mockImplementation(() => {
      throw new Error('paste failed')
    })

    expect(() => actions.pasteClipboard()).toThrow('paste failed')
    expect(store.commands.beginTransaction).toHaveBeenCalledWith('Paste')
    expect(store.commands.commitTransaction).not.toHaveBeenCalled()
    expect(store.commands.rollbackTransaction).toHaveBeenCalledOnce()
    expect(store.selection.ids).toEqual([])
  })

  it('skips locked nodes when deleting selection', () => {
    const locked = { ...makeNode('locked'), locked: true }
    const unlocked = makeNode('open')
    const store = makeStore([locked, unlocked], ['locked', 'open'])
    const actions = createClipboardActions(store, () => [locked, unlocked])
    const executeSpy = vi.spyOn(store.commands, 'execute')

    actions.deleteSelection()

    expect(store.commands.beginTransaction).toHaveBeenCalledWith('Delete')
    expect(store.commands.commitTransaction).toHaveBeenCalledOnce()
    expect(store.commands.rollbackTransaction).not.toHaveBeenCalled()
    expect(executeSpy).toHaveBeenCalledOnce()
  })
})
