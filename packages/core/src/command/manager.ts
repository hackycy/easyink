import type { Command, CommandManagerEvents } from './types'
import { generateId } from '@easyink/shared'

/**
 * 命令管理器 — 管理撤销/重做栈
 *
 * - 执行命令并压入撤销栈
 * - 支持命令合并（如连续拖拽）
 * - 支持事务（多个操作合并为一个撤销步骤）
 */
export class CommandManager {
  private undoStack: Command[] = []
  private redoStack: Command[] = []
  private maxStackSize: number
  private transactionStack: Command[] | null = null
  private transactionDescription: string = ''
  private listeners = new Map<string, Set<(...args: any[]) => void>>()

  constructor(options?: { maxStackSize?: number }) {
    this.maxStackSize = options?.maxStackSize ?? 100
  }

  /**
   * 执行命令并压入撤销栈
   */
  execute(command: Command): void {
    command.execute()

    if (this.transactionStack) {
      this.transactionStack.push(command)
      return
    }

    this._pushToUndoStack(command)
    this.redoStack = []
    this._emit('executed', command)
    this._emit('stateChanged')
  }

  /**
   * 撤销最近的命令
   */
  undo(): void {
    if (this.transactionStack) {
      return
    }
    const command = this.undoStack.pop()
    if (!command)
      return
    command.undo()
    this.redoStack.push(command)
    this._emit('undone', command)
    this._emit('stateChanged')
  }

  /**
   * 重做最近撤销的命令
   */
  redo(): void {
    if (this.transactionStack) {
      return
    }
    const command = this.redoStack.pop()
    if (!command)
      return
    command.execute()
    this.undoStack.push(command)
    this._emit('redone', command)
    this._emit('stateChanged')
  }

  /** 是否可撤销 */
  get canUndo(): boolean {
    return this.undoStack.length > 0
  }

  /** 是否可重做 */
  get canRedo(): boolean {
    return this.redoStack.length > 0
  }

  /** 撤销栈大小 */
  get undoSize(): number {
    return this.undoStack.length
  }

  /** 重做栈大小 */
  get redoSize(): number {
    return this.redoStack.length
  }

  /**
   * 开始事务（多个操作合并为一个撤销步骤）
   */
  beginTransaction(description: string): void {
    if (this.transactionStack) {
      throw new Error('Cannot nest transactions')
    }
    this.transactionStack = []
    this.transactionDescription = description
  }

  /**
   * 提交事务
   */
  commitTransaction(): void {
    if (!this.transactionStack) {
      throw new Error('No active transaction')
    }
    const commands = this.transactionStack
    this.transactionStack = null

    if (commands.length === 0)
      return

    const batchCommand = createBatchCommand(
      this.transactionDescription,
      commands,
    )
    this._pushToUndoStack(batchCommand)
    this.redoStack = []
    this._emit('executed', batchCommand)
    this._emit('stateChanged')
  }

  /**
   * 回滚事务
   */
  rollbackTransaction(): void {
    if (!this.transactionStack) {
      throw new Error('No active transaction')
    }
    const commands = this.transactionStack
    this.transactionStack = null

    // 逆序撤销事务内所有已执行的命令
    for (let i = commands.length - 1; i >= 0; i--) {
      commands[i].undo()
    }
    this._emit('stateChanged')
  }

  /** 是否在事务中 */
  get inTransaction(): boolean {
    return this.transactionStack !== null
  }

  /**
   * 清空历史
   */
  clear(): void {
    this.undoStack = []
    this.redoStack = []
    this.transactionStack = null
    this._emit('stateChanged')
  }

  /**
   * 监听事件
   */
  on<K extends keyof CommandManagerEvents>(
    event: K,
    callback: CommandManagerEvents[K],
  ): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }
    this.listeners.get(event)!.add(callback)
  }

  /**
   * 取消监听
   */
  off<K extends keyof CommandManagerEvents>(
    event: K,
    callback: CommandManagerEvents[K],
  ): void {
    this.listeners.get(event)?.delete(callback)
  }

  // ─── 内部方法 ───

  private _pushToUndoStack(command: Command): void {
    // 尝试合并
    if (this.undoStack.length > 0) {
      const top = this.undoStack[this.undoStack.length - 1]
      if (top.mergeable && top.type === command.type && top.merge) {
        const merged = top.merge(command)
        if (merged) {
          this.undoStack[this.undoStack.length - 1] = merged
          return
        }
      }
    }
    this.undoStack.push(command)
    // 限制栈大小
    if (this.undoStack.length > this.maxStackSize) {
      this.undoStack.shift()
    }
  }

  private _emit(event: string, ...args: unknown[]): void {
    const callbacks = this.listeners.get(event)
    if (callbacks) {
      for (const cb of callbacks) {
        cb(...args)
      }
    }
  }
}

/**
 * 创建批量命令（事务中多个操作合并为一个撤销步骤）
 */
export function createBatchCommand(
  description: string,
  commands: Command[],
): Command {
  return {
    id: generateId(),
    type: 'batch',
    description,
    execute() {
      for (const cmd of commands) {
        cmd.execute()
      }
    },
    undo() {
      for (let i = commands.length - 1; i >= 0; i--) {
        commands[i].undo()
      }
    },
  }
}
