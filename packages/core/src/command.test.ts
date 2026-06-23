import type { DocumentSchema, MaterialNode } from '@easyink/schema'
import type { Command } from './command'
import { describe, expect, it } from 'vitest'
import { CommandManager } from './command'
import { AddElementGroupCommand, RemoveElementGroupCommand, RemoveMaterialCommand, UpdateMaterialMetaCommand, UpdateRenderConditionCommand } from './commands'

function makeCommand(id: string, log: string[]): Command {
  return {
    id,
    type: 'test',
    description: `cmd-${id}`,
    execute: () => { log.push(`exec:${id}`) },
    undo: () => { log.push(`undo:${id}`) },
  }
}

describe('commandManager', () => {
  it('executes a command', () => {
    const mgr = new CommandManager()
    const log: string[] = []
    mgr.execute(makeCommand('a', log))
    expect(log).toEqual(['exec:a'])
  })

  it('undoes a command', () => {
    const mgr = new CommandManager()
    const log: string[] = []
    mgr.execute(makeCommand('a', log))
    mgr.undo()
    expect(log).toEqual(['exec:a', 'undo:a'])
  })

  it('redoes a command', () => {
    const mgr = new CommandManager()
    const log: string[] = []
    mgr.execute(makeCommand('a', log))
    mgr.undo()
    mgr.redo()
    expect(log).toEqual(['exec:a', 'undo:a', 'exec:a'])
  })

  it('canUndo / canRedo', () => {
    const mgr = new CommandManager()
    expect(mgr.canUndo).toBe(false)
    expect(mgr.canRedo).toBe(false)

    mgr.execute(makeCommand('a', []))
    expect(mgr.canUndo).toBe(true)
    expect(mgr.canRedo).toBe(false)

    mgr.undo()
    expect(mgr.canUndo).toBe(false)
    expect(mgr.canRedo).toBe(true)
  })

  it('restores applied state and keeps history when undo throws', () => {
    const mgr = new CommandManager()
    let applied = false
    const command: Command = {
      id: 'broken-undo',
      type: 'test',
      description: 'broken undo',
      execute: () => {
        applied = true
      },
      undo: () => {
        applied = false
        throw new Error('undo failed')
      },
    }

    mgr.execute(command)

    expect(() => mgr.undo()).toThrowError('undo failed')
    expect(applied).toBe(true)
    expect(mgr.canUndo).toBe(true)
    expect(mgr.canRedo).toBe(false)
    expect(mgr.cursor).toBe(1)
  })

  it('clears redo stack after new execute', () => {
    const mgr = new CommandManager()
    mgr.execute(makeCommand('a', []))
    mgr.undo()
    mgr.execute(makeCommand('b', []))
    expect(mgr.canRedo).toBe(false)
  })

  it('rolls back partial state and skips history when execute throws', () => {
    const mgr = new CommandManager()
    const state: string[] = []
    const command: Command = {
      id: 'broken-execute',
      type: 'test',
      description: 'broken execute',
      execute: () => {
        state.push('mutated')
        throw new Error('execute failed')
      },
      undo: () => {
        state.pop()
      },
    }

    expect(() => mgr.execute(command)).toThrowError('execute failed')
    expect(state).toEqual([])
    expect(mgr.canUndo).toBe(false)
    expect(mgr.historyEntries).toEqual([])
  })

  it('removes the history entry when execute fails after push', () => {
    const mgr = new CommandManager()
    const log: string[] = []

    mgr.onChange(() => {
      throw new Error('listener failed')
    })

    expect(() => mgr.execute(makeCommand('a', log))).toThrowError('listener failed')
    expect(log).toEqual(['exec:a', 'undo:a'])
    expect(mgr.canUndo).toBe(false)
    expect(mgr.canRedo).toBe(false)
    expect(mgr.historyEntries).toEqual([])
  })

  it('merges commands when merge returns non-null', () => {
    const mgr = new CommandManager()
    const log: string[] = []
    const cmd1: Command = {
      id: '1',
      type: 'test',
      description: 'first',
      execute: () => { log.push('exec:1') },
      undo: () => { log.push('undo:1') },
      merge: () => ({
        id: 'merged',
        type: 'test',
        description: 'merged',
        execute: () => { log.push('exec:merged') },
        undo: () => { log.push('undo:merged') },
      }),
    }
    const cmd2 = makeCommand('2', log)

    mgr.execute(cmd1)
    mgr.execute(cmd2)

    mgr.undo()
    expect(log).toContain('undo:merged')
  })

  it('beginTransaction / commitTransaction groups commands', () => {
    const mgr = new CommandManager()
    const log: string[] = []
    mgr.beginTransaction('batch')
    mgr.execute(makeCommand('a', log))
    mgr.execute(makeCommand('b', log))
    mgr.commitTransaction()

    expect(log).toEqual(['exec:a', 'exec:b'])

    mgr.undo()
    expect(log).toEqual(['exec:a', 'exec:b', 'undo:b', 'undo:a'])
  })

  it('rollbackTransaction undoes all commands in reverse', () => {
    const mgr = new CommandManager()
    const log: string[] = []
    mgr.beginTransaction('batch')
    mgr.execute(makeCommand('a', log))
    mgr.execute(makeCommand('b', log))
    mgr.rollbackTransaction()

    expect(log).toEqual(['exec:a', 'exec:b', 'undo:b', 'undo:a'])
    expect(mgr.canUndo).toBe(false)
  })

  it('clear resets all stacks', () => {
    const mgr = new CommandManager()
    mgr.execute(makeCommand('a', []))
    mgr.execute(makeCommand('b', []))
    mgr.undo()
    mgr.clear()
    expect(mgr.canUndo).toBe(false)
    expect(mgr.canRedo).toBe(false)
  })

  it('historyEntries returns ordered list across undo and redo stacks', () => {
    const mgr = new CommandManager()
    const log: string[] = []
    mgr.execute(makeCommand('a', log))
    mgr.execute(makeCommand('b', log))
    mgr.execute(makeCommand('c', log))
    mgr.undo() // c moves to redo

    const entries = mgr.historyEntries
    expect(entries).toHaveLength(3)
    expect(entries.map(e => e.id)).toEqual(['a', 'b', 'c'])
  })

  it('cursor tracks undo stack depth', () => {
    const mgr = new CommandManager()
    const log: string[] = []
    expect(mgr.cursor).toBe(0)

    mgr.execute(makeCommand('a', log))
    expect(mgr.cursor).toBe(1)

    mgr.execute(makeCommand('b', log))
    expect(mgr.cursor).toBe(2)

    mgr.undo()
    expect(mgr.cursor).toBe(1)

    mgr.redo()
    expect(mgr.cursor).toBe(2)
  })

  it('totalCount returns sum of both stacks', () => {
    const mgr = new CommandManager()
    const log: string[] = []
    mgr.execute(makeCommand('a', log))
    mgr.execute(makeCommand('b', log))
    mgr.undo()
    expect(mgr.totalCount).toBe(2)
  })

  it('goTo jumps backward (batch undo)', () => {
    const mgr = new CommandManager()
    const log: string[] = []
    mgr.execute(makeCommand('a', log))
    mgr.execute(makeCommand('b', log))
    mgr.execute(makeCommand('c', log))

    mgr.goTo(1)
    expect(mgr.cursor).toBe(1)
    expect(log).toEqual(['exec:a', 'exec:b', 'exec:c', 'undo:c', 'undo:b'])
  })

  it('goTo jumps forward (batch redo)', () => {
    const mgr = new CommandManager()
    const log: string[] = []
    mgr.execute(makeCommand('a', log))
    mgr.execute(makeCommand('b', log))
    mgr.execute(makeCommand('c', log))
    mgr.goTo(0)

    log.length = 0
    mgr.goTo(2)
    expect(mgr.cursor).toBe(2)
    expect(log).toEqual(['exec:a', 'exec:b'])
  })

  it('goTo to current position is a no-op', () => {
    const mgr = new CommandManager()
    const log: string[] = []
    mgr.execute(makeCommand('a', log))

    const listenerCalls: number[] = []
    mgr.onChange(() => {
      listenerCalls.push(1)
    })
    mgr.goTo(1)
    expect(listenerCalls).toHaveLength(0)
  })

  it('goTo notifies only once', () => {
    const mgr = new CommandManager()
    const log: string[] = []
    mgr.execute(makeCommand('a', log))
    mgr.execute(makeCommand('b', log))
    mgr.execute(makeCommand('c', log))

    const listenerCalls: number[] = []
    mgr.onChange(() => {
      listenerCalls.push(1)
    })
    mgr.goTo(0)
    expect(listenerCalls).toHaveLength(1)
  })

  it('clear resets historyEntries and cursor', () => {
    const mgr = new CommandManager()
    mgr.execute(makeCommand('a', []))
    mgr.execute(makeCommand('b', []))
    mgr.clear()
    expect(mgr.historyEntries).toHaveLength(0)
    expect(mgr.cursor).toBe(0)
    expect(mgr.totalCount).toBe(0)
  })
})

describe('updateRenderConditionCommand', () => {
  it('stores full snapshots for undo and merges continuous edits by merge key', () => {
    const elements: MaterialNode[] = [{ id: 'n', type: 'text', x: 0, y: 0, width: 1, height: 1, props: {} }]
    const manager = new CommandManager()
    const makeCondition = (path: string) => ({
      whenMatched: 'show' as const,
      groups: [{ conditions: [{ source: { path }, operator: 'exists' as const }] }],
    })

    manager.execute(new UpdateRenderConditionCommand(elements, 'n', makeCondition('a'), 'field'))
    manager.execute(new UpdateRenderConditionCommand(elements, 'n', makeCondition('abc'), 'field'))
    expect(elements[0]?.renderCondition).toEqual(makeCondition('abc'))
    expect(manager.cursor).toBe(1)

    manager.undo()
    expect(elements[0]?.renderCondition).toBeUndefined()
    manager.redo()
    expect(elements[0]?.renderCondition).toEqual(makeCondition('abc'))
  })
})

describe('logical element group commands', () => {
  function makeNode(id: string): MaterialNode {
    return { id, type: 'rect', x: 0, y: 0, width: 10, height: 10, props: {} }
  }

  function makeSchema(): DocumentSchema {
    return {
      version: '1.0.0',
      unit: 'px',
      page: { mode: 'fixed', width: 100, height: 100 },
      guides: { x: [], y: [] },
      elements: [makeNode('a'), makeNode('b'), makeNode('c')],
    }
  }

  it('adds and removes logical groups through undoable commands', () => {
    const schema = makeSchema()
    const manager = new CommandManager()

    manager.execute(new AddElementGroupCommand(schema, { id: 'grp_1', memberIds: ['a', 'b'] }))
    expect(schema.groups).toEqual([{ id: 'grp_1', memberIds: ['a', 'b'] }])

    manager.undo()
    expect(schema.groups).toEqual([])

    manager.redo()
    expect(schema.groups).toEqual([{ id: 'grp_1', memberIds: ['a', 'b'] }])

    manager.execute(new RemoveElementGroupCommand(schema, 'grp_1'))
    expect(schema.groups).toEqual([])

    manager.undo()
    expect(schema.groups).toEqual([{ id: 'grp_1', memberIds: ['a', 'b'] }])
  })

  it('prunes removed elements from logical groups and restores them on undo', () => {
    const schema = makeSchema()
    schema.groups = [{ id: 'grp_1', memberIds: ['a', 'b', 'c'] }]
    const manager = new CommandManager()

    manager.execute(new RemoveMaterialCommand(schema.elements, 'b', schema))
    expect(schema.elements.map(node => node.id)).toEqual(['a', 'c'])
    expect(schema.groups).toEqual([{ id: 'grp_1', memberIds: ['a', 'c'] }])

    manager.undo()
    expect(schema.elements.map(node => node.id)).toEqual(['a', 'b', 'c'])
    expect(schema.groups).toEqual([{ id: 'grp_1', memberIds: ['a', 'b', 'c'] }])
  })

  it('updates and removes child elements through undoable commands', () => {
    const schema = makeSchema()
    schema.elements = [
      {
        ...makeNode('parent'),
        children: [makeNode('child')],
      },
    ]
    const manager = new CommandManager()

    manager.execute(new UpdateMaterialMetaCommand(schema.elements, 'child', { hidden: true }))
    expect(schema.elements[0]!.children![0]!.hidden).toBe(true)

    manager.execute(new RemoveMaterialCommand(schema.elements, 'child', schema))
    expect(schema.elements[0]!.children).toEqual([])

    manager.undo()
    expect(schema.elements[0]!.children!.map(node => node.id)).toEqual(['child'])
    expect(schema.elements[0]!.children![0]!.hidden).toBe(true)

    manager.undo()
    expect(schema.elements[0]!.children![0]!.hidden).toBeUndefined()
  })
})
