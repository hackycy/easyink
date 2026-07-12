import type { MaterialNode } from '@easyink/schema'
import { describe, expect, it } from 'vitest'
import { BindFieldCommand } from './data'

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
