import type { Command } from './command'
import { describe, expect, it } from 'vitest'
import { CommandManager } from './command'

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

  it('clears redo stack after new execute', () => {
    const mgr = new CommandManager()
    mgr.execute(makeCommand('a', []))
    mgr.undo()
    mgr.execute(makeCommand('b', []))
    expect(mgr.canRedo).toBe(false)
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
