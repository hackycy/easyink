import type { MaterialNode } from '@easyink/schema'
import { describe, expect, it } from 'vitest'
import { BindFieldCommand, ClearBindingCommand, UpdateBindingFormatCommand, UpdateMaterialBindingCommand } from './data'

describe('bindFieldCommand', () => {
  it('writes and restores the explicitly declared canonical port', () => {
    const node = materialNode()
    node.bindings.src = { sourceId: 'old', fieldPath: 'old/path' }
    const command = new BindFieldCommand(
      [node],
      node.id,
      { sourceId: 'new', fieldPath: 'new/path' },
      'src',
    )

    command.execute()
    expect(node.bindings).toEqual({ src: { sourceId: 'new', fieldPath: 'new/path' } })

    command.undo()
    expect(node.bindings).toEqual({ src: { sourceId: 'old', fieldPath: 'old/path' } })
  })

  it('removes a newly created explicit port on undo without touching siblings', () => {
    const node = materialNode()
    node.bindings.sibling = { sourceId: 'keep', fieldPath: 'keep/path' }
    const command = new BindFieldCommand(
      [node],
      node.id,
      { sourceId: 'new', fieldPath: 'new/path' },
      'src',
    )

    command.execute()
    command.undo()

    expect(node.bindings).toEqual({ sibling: { sourceId: 'keep', fieldPath: 'keep/path' } })
  })
})

describe('port-aware binding commands', () => {
  it('clears and restores only the requested port', () => {
    const node = materialNode()
    node.bindings.src = { sourceId: 'images', fieldPath: 'photo' }
    node.bindings.sibling = { sourceId: 'keep', fieldPath: 'value' }
    const command = new ClearBindingCommand([node], node.id, 'src')

    command.execute()
    expect(node.bindings).toEqual({ sibling: { sourceId: 'keep', fieldPath: 'value' } })
    command.undo()
    expect(node.bindings.src).toEqual({ sourceId: 'images', fieldPath: 'photo' })
  })

  it('updates format and data-contract values on explicit ports with exact undo', () => {
    const node = materialNode()
    node.bindings.src = { sourceId: 'images', fieldPath: 'photo' }
    const format = new UpdateBindingFormatCommand([node], node.id, { mode: 'preset', preset: { type: 'number' } }, 0, 'src')
    format.execute()
    expect(node.bindings.src).toMatchObject({ format: { mode: 'preset', preset: { type: 'number' } } })
    format.undo()
    expect(node.bindings.src).toEqual({ sourceId: 'images', fieldPath: 'photo' })

    const contract = { kind: 'data-contract' as const, mappings: {} }
    const update = new UpdateMaterialBindingCommand([node], node.id, contract, 'dataset')
    update.execute()
    expect(node.bindings.dataset).toEqual(contract)
    expect(node.bindings.src).toEqual({ sourceId: 'images', fieldPath: 'photo' })
    update.undo()
    expect(node.bindings.dataset).toBeUndefined()
  })
})

function materialNode(): MaterialNode {
  return {
    id: 'node',
    type: 'image',
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    modelVersion: 1,
    model: {},
    slots: {},
    bindings: {},
    output: { visibility: 'include' },
  }
}
