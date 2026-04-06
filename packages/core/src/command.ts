/**
 * Command interface for undo/redo operations.
 * Every mutation that enters the history stack must implement this.
 */
export interface Command {
  id: string
  type: string
  description: string
  execute: () => void
  undo: () => void
  merge?: (next: Command) => Command | null
}

/**
 * Read-only snapshot of a history entry for UI consumption.
 */
export interface HistoryEntry {
  id: string
  type: string
  description: string
}

/**
 * CommandManager manages the undo/redo stack and transactions.
 */
export class CommandManager {
  private undoStack: Command[] = []
  private redoStack: Command[] = []
  private transactionStack: Command[][] = []
  private transactionDescriptions: string[] = []
  private _listeners: Array<() => void> = []

  get canUndo(): boolean {
    return this.undoStack.length > 0
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0
  }

  get undoDescription(): string | undefined {
    return this.undoStack[this.undoStack.length - 1]?.description
  }

  get redoDescription(): string | undefined {
    return this.redoStack[this.redoStack.length - 1]?.description
  }

  /** Current cursor position (number of applied commands). */
  get cursor(): number {
    return this.undoStack.length
  }

  /** Total number of commands across undo + redo stacks. */
  get totalCount(): number {
    return this.undoStack.length + this.redoStack.length
  }

  /** Ordered snapshot of all history entries (oldest first). Redo entries are in reverse stack order. */
  get historyEntries(): HistoryEntry[] {
    const entries: HistoryEntry[] = []
    for (const cmd of this.undoStack) {
      entries.push({ id: cmd.id, type: cmd.type, description: cmd.description })
    }
    for (let i = this.redoStack.length - 1; i >= 0; i--) {
      const cmd = this.redoStack[i]!
      entries.push({ id: cmd.id, type: cmd.type, description: cmd.description })
    }
    return entries
  }

  /** Jump to a specific history position by batching undo/redo calls. */
  goTo(index: number): void {
    if (index < 0 || index > this.totalCount || index === this.undoStack.length)
      return

    if (index < this.undoStack.length) {
      const steps = this.undoStack.length - index
      for (let i = 0; i < steps; i++) {
        const command = this.undoStack.pop()!
        command.undo()
        this.redoStack.push(command)
      }
    }
    else {
      const steps = index - this.undoStack.length
      for (let i = 0; i < steps; i++) {
        const command = this.redoStack.pop()!
        command.execute()
        this.undoStack.push(command)
      }
    }
    this.notify()
  }

  execute(command: Command): void {
    command.execute()

    if (this.transactionStack.length > 0) {
      this.transactionStack[this.transactionStack.length - 1]!.push(command)
      return
    }

    // Try merge with last command
    if (this.undoStack.length > 0) {
      const last = this.undoStack[this.undoStack.length - 1]!
      if (last.merge) {
        const merged = last.merge(command)
        if (merged) {
          this.undoStack[this.undoStack.length - 1] = merged
          this.redoStack = []
          this.notify()
          return
        }
      }
    }

    this.undoStack.push(command)
    this.redoStack = []
    this.notify()
  }

  undo(): void {
    const command = this.undoStack.pop()
    if (!command)
      return
    command.undo()
    this.redoStack.push(command)
    this.notify()
  }

  redo(): void {
    const command = this.redoStack.pop()
    if (!command)
      return
    command.execute()
    this.undoStack.push(command)
    this.notify()
  }

  beginTransaction(description: string): void {
    this.transactionStack.push([])
    this.transactionDescriptions.push(description)
  }

  commitTransaction(): void {
    const commands = this.transactionStack.pop()
    const description = this.transactionDescriptions.pop()
    if (!commands || commands.length === 0)
      return

    const batchCommand = createBatchCommand(
      description || 'Batch operation',
      commands,
    )

    this.undoStack.push(batchCommand)
    this.redoStack = []
    this.notify()
  }

  rollbackTransaction(): void {
    const commands = this.transactionStack.pop()
    this.transactionDescriptions.pop()
    if (!commands)
      return

    // Undo in reverse order
    for (let i = commands.length - 1; i >= 0; i--) {
      commands[i]!.undo()
    }
    this.notify()
  }

  clear(): void {
    this.undoStack = []
    this.redoStack = []
    this.transactionStack = []
    this.transactionDescriptions = []
    this.notify()
  }

  onChange(listener: () => void): () => void {
    this._listeners.push(listener)
    return () => {
      const idx = this._listeners.indexOf(listener)
      if (idx >= 0)
        this._listeners.splice(idx, 1)
    }
  }

  private notify(): void {
    for (const listener of this._listeners) {
      listener()
    }
  }
}

/**
 * Create a batch command that groups multiple commands into one undo/redo step.
 */
export function createBatchCommand(description: string, commands: Command[]): Command {
  return {
    id: `batch_${Date.now().toString(36)}`,
    type: 'batch',
    description,
    execute() {
      for (const cmd of commands) {
        cmd.execute()
      }
    },
    undo() {
      for (let i = commands.length - 1; i >= 0; i--) {
        commands[i]!.undo()
      }
    },
  }
}
