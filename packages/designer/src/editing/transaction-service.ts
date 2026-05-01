import type { CommandManager, TransactionAPI, TxOptions } from '@easyink/core'
import type { MaterialNode } from '@easyink/schema'
import type { DiagnosticsChannel } from '../store/diagnostics'
import { PatchCommand } from '@easyink/core'
import { create } from 'mutative'

/**
 * Create a TransactionAPI that uses mutative for draft-based mutations
 * and produces PatchCommands for the history stack.
 *
 * Failure inside a `batch` callback rolls back the in-progress transaction
 * and reports the error to the designer-level diagnostics channel
 * (audit/202605011431.md item 4) before re-throwing. Re-throwing is kept
 * because behavior callers expect to know whether the batch committed —
 * but the diagnostic guarantees the failure surfaces in DebugPanel and to
 * any host listener even if the caller swallows the throw.
 */
export function createTransactionService(
  getNode: (id: string) => MaterialNode | undefined,
  commands: CommandManager,
  diagnostics?: DiagnosticsChannel,
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
        diagnostics?.push({
          source: 'transaction',
          severity: 'error',
          message: 'Batch transaction rolled back after callback threw',
          detail: {
            error: err instanceof Error ? err.message : String(err),
            stack: err instanceof Error ? err.stack : undefined,
          },
        })
        throw err
      }
    },
  }
}
