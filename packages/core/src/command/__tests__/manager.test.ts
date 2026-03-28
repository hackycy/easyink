import type { Command } from '../types'
import { describe, expect, it, vi } from 'vitest'
import { CommandManager, createBatchCommand } from '../manager'

function createMockCommand(overrides?: Partial<Command>): Command {
  return {
    id: `cmd-${Math.random().toString(36).slice(2, 8)}`,
    type: 'test',
    description: 'test command',
    execute: vi.fn(),
    undo: vi.fn(),
    ...overrides,
  }
}

describe('commandManager', () => {
  it('should execute a command and push to undo stack', () => {
    const manager = new CommandManager()
    const cmd = createMockCommand()

    manager.execute(cmd)

    expect(cmd.execute).toHaveBeenCalledOnce()
    expect(manager.canUndo).toBe(true)
    expect(manager.canRedo).toBe(false)
    expect(manager.undoSize).toBe(1)
  })

  it('should undo a command', () => {
    const manager = new CommandManager()
    const cmd = createMockCommand()

    manager.execute(cmd)
    manager.undo()

    expect(cmd.undo).toHaveBeenCalledOnce()
    expect(manager.canUndo).toBe(false)
    expect(manager.canRedo).toBe(true)
  })

  it('should redo an undone command', () => {
    const manager = new CommandManager()
    const cmd = createMockCommand()

    manager.execute(cmd)
    manager.undo()
    manager.redo()

    expect(cmd.execute).toHaveBeenCalledTimes(2)
    expect(manager.canUndo).toBe(true)
    expect(manager.canRedo).toBe(false)
  })

  it('should clear redo stack after new execute', () => {
    const manager = new CommandManager()
    const cmd1 = createMockCommand()
    const cmd2 = createMockCommand()

    manager.execute(cmd1)
    manager.undo()
    expect(manager.canRedo).toBe(true)

    manager.execute(cmd2)
    expect(manager.canRedo).toBe(false)
  })

  it('should do nothing when undo/redo on empty stack', () => {
    const manager = new CommandManager()

    manager.undo()
    manager.redo()

    expect(manager.canUndo).toBe(false)
    expect(manager.canRedo).toBe(false)
  })

  it('should merge consecutive mergeable commands', () => {
    const manager = new CommandManager()

    let value = 0
    const createIncrementCmd = (from: number, to: number): Command => ({
      id: `inc-${Math.random()}`,
      type: 'increment',
      description: 'increment',
      mergeable: true,
      execute() { value = to },
      undo() { value = from },
      merge(next: Command) {
        const nextTo = (next as any)._to
        return createIncrementCmd(from, nextTo)
      },
      get _to() { return to },
    } as any)

    manager.execute(createIncrementCmd(0, 1))
    manager.execute(createIncrementCmd(1, 2))
    manager.execute(createIncrementCmd(2, 3))

    expect(value).toBe(3)
    expect(manager.undoSize).toBe(1) // merged into one

    manager.undo()
    expect(value).toBe(0) // undo all the way back
  })

  it('should not merge commands of different types', () => {
    const manager = new CommandManager()
    const cmd1 = createMockCommand({ type: 'a', mergeable: true })
    const cmd2 = createMockCommand({ type: 'b', mergeable: true })

    manager.execute(cmd1)
    manager.execute(cmd2)

    expect(manager.undoSize).toBe(2)
  })

  it('should not merge non-mergeable commands', () => {
    const manager = new CommandManager()
    const cmd1 = createMockCommand()
    const cmd2 = createMockCommand()

    manager.execute(cmd1)
    manager.execute(cmd2)

    expect(manager.undoSize).toBe(2)
  })

  it('should respect maxStackSize', () => {
    const manager = new CommandManager({ maxStackSize: 3 })

    for (let i = 0; i < 5; i++) {
      manager.execute(createMockCommand({ type: `cmd-${i}` }))
    }

    expect(manager.undoSize).toBe(3)
  })

  it('should clear all stacks', () => {
    const manager = new CommandManager()
    manager.execute(createMockCommand())
    manager.execute(createMockCommand())
    manager.undo()

    manager.clear()

    expect(manager.canUndo).toBe(false)
    expect(manager.canRedo).toBe(false)
    expect(manager.undoSize).toBe(0)
    expect(manager.redoSize).toBe(0)
  })

  // ─── 事务 ───

  it('should support transaction (commit)', () => {
    const manager = new CommandManager()
    const results: number[] = []
    const cmd1 = createMockCommand({ execute: vi.fn(() => results.push(1)), undo: vi.fn(() => results.pop()) })
    const cmd2 = createMockCommand({ execute: vi.fn(() => results.push(2)), undo: vi.fn(() => results.pop()) })

    manager.beginTransaction('batch op')
    manager.execute(cmd1)
    manager.execute(cmd2)
    expect(manager.undoSize).toBe(0) // not yet committed

    manager.commitTransaction()
    expect(manager.undoSize).toBe(1) // single batch command
    expect(results).toEqual([1, 2])

    manager.undo()
    expect(results).toEqual([]) // both undone in reverse
    expect(manager.undoSize).toBe(0)
  })

  it('should support transaction (rollback)', () => {
    const manager = new CommandManager()
    let value = 0
    const cmd1 = createMockCommand({
      execute: vi.fn(() => { value += 10 }),
      undo: vi.fn(() => { value -= 10 }),
    })
    const cmd2 = createMockCommand({
      execute: vi.fn(() => { value += 20 }),
      undo: vi.fn(() => { value -= 20 }),
    })

    manager.beginTransaction('will rollback')
    manager.execute(cmd1)
    manager.execute(cmd2)
    expect(value).toBe(30)

    manager.rollbackTransaction()
    expect(value).toBe(0) // all undone
    expect(manager.undoSize).toBe(0) // nothing added to stack
  })

  it('should throw when nesting transactions', () => {
    const manager = new CommandManager()
    manager.beginTransaction('outer')
    expect(() => manager.beginTransaction('inner')).toThrow('Cannot nest transactions')
    manager.commitTransaction()
  })

  it('should throw when committing without transaction', () => {
    const manager = new CommandManager()
    expect(() => manager.commitTransaction()).toThrow('No active transaction')
  })

  it('should throw when rolling back without transaction', () => {
    const manager = new CommandManager()
    expect(() => manager.rollbackTransaction()).toThrow('No active transaction')
  })

  it('should ignore undo/redo during transaction', () => {
    const manager = new CommandManager()
    manager.execute(createMockCommand())
    manager.beginTransaction('tx')
    manager.undo()
    manager.redo()
    expect(manager.undoSize).toBe(1) // unchanged
    manager.commitTransaction()
  })

  it('should handle empty transaction commit gracefully', () => {
    const manager = new CommandManager()
    manager.beginTransaction('empty')
    manager.commitTransaction()
    expect(manager.undoSize).toBe(0)
  })

  // ─── 事件 ───

  it('should emit events on execute/undo/redo', () => {
    const manager = new CommandManager()
    const executed = vi.fn()
    const undone = vi.fn()
    const redone = vi.fn()
    const stateChanged = vi.fn()

    manager.on('executed', executed)
    manager.on('undone', undone)
    manager.on('redone', redone)
    manager.on('stateChanged', stateChanged)

    const cmd = createMockCommand()
    manager.execute(cmd)
    expect(executed).toHaveBeenCalledWith(cmd)
    expect(stateChanged).toHaveBeenCalledTimes(1)

    manager.undo()
    expect(undone).toHaveBeenCalledWith(cmd)
    expect(stateChanged).toHaveBeenCalledTimes(2)

    manager.redo()
    expect(redone).toHaveBeenCalledWith(cmd)
    expect(stateChanged).toHaveBeenCalledTimes(3)
  })

  it('should support off to remove listener', () => {
    const manager = new CommandManager()
    const fn = vi.fn()
    manager.on('executed', fn)
    manager.off('executed', fn)
    manager.execute(createMockCommand())
    expect(fn).not.toHaveBeenCalled()
  })

  it('should report inTransaction correctly', () => {
    const manager = new CommandManager()
    expect(manager.inTransaction).toBe(false)
    manager.beginTransaction('tx')
    expect(manager.inTransaction).toBe(true)
    manager.commitTransaction()
    expect(manager.inTransaction).toBe(false)
  })
})

describe('createBatchCommand', () => {
  it('should execute all commands in order', () => {
    const results: number[] = []
    const cmd1 = createMockCommand({ execute: vi.fn(() => results.push(1)) })
    const cmd2 = createMockCommand({ execute: vi.fn(() => results.push(2)) })

    const batch = createBatchCommand('batch', [cmd1, cmd2])
    batch.execute()

    expect(results).toEqual([1, 2])
  })

  it('should undo all commands in reverse order', () => {
    const results: number[] = []
    const cmd1 = createMockCommand({
      execute: vi.fn(() => results.push(1)),
      undo: vi.fn(() => { expect(results.pop()).toBe(1) }),
    })
    const cmd2 = createMockCommand({
      execute: vi.fn(() => results.push(2)),
      undo: vi.fn(() => { expect(results.pop()).toBe(2) }),
    })

    const batch = createBatchCommand('batch', [cmd1, cmd2])
    batch.execute()
    batch.undo()

    expect(results).toEqual([])
  })
})
