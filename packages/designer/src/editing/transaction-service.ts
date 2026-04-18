import type { CommandManager, TransactionAPI, TxOptions } from '@easyink/core'
import type { MaterialNode } from '@easyink/schema'
import { PatchCommand } from '@easyink/core'
import { create } from 'mutative'

/**
 * Create a TransactionAPI that uses mutative for draft-based mutations
 * and produces PatchCommands for the history stack.
 */
export function createTransactionService(
  getNode: (id: string) => MaterialNode | undefined,
  commands: CommandManager,
): TransactionAPI {
  return {
    run(nodeId: string, mutator: (draft: MaterialNode) => void, options?: TxOptions): void {
      const node = getNode(nodeId)
      if (!node) {
        throw new Error(`[EasyInk] tx.run: node "${nodeId}" not found`)
      }

      // Use mutative to generate patches from the draft mutation
      const [, patches, inversePatches] = create(
        node,
        (draft) => {
          mutator(draft as MaterialNode)
        },
        { enablePatches: true },
      )

      if (patches.length === 0)
        return

      const cmd = new PatchCommand(
        () => getNode(nodeId)!,
        patches,
        inversePatches,
        {
          mergeKey: options?.mergeKey,
          mergeWindowMs: options?.mergeWindowMs,
          label: options?.label,
        },
      )

      // CommandManager handles execution + history push + merge
      commands.execute(cmd)
    },

    batch<T>(fn: () => T): T {
      // Use CommandManager's built-in transaction support
      commands.beginTransaction('Batch edit')
      try {
        const result = fn()
        commands.commitTransaction()
        return result
      }
      catch (err) {
        commands.rollbackTransaction()
        throw err
      }
    },
  }
}
