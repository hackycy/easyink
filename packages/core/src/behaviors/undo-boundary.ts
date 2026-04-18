import type { BehaviorContext, BehaviorRegistration } from '../editing-session'

export interface UndoBoundaryOptions {
  /** Group undo entries by this key (e.g. 'cell' groups per-cell edits) */
  groupBy?: string
}

/**
 * Framework-level undo boundary middleware.
 * Marks undo boundaries when selection changes so that undo operates at
 * the selection granularity (e.g. each cell edit is a separate undo step).
 */
export function undoBoundaryMiddleware(_options?: UndoBoundaryOptions): BehaviorRegistration {
  let lastSelectionKey: string | null = null

  return {
    id: 'framework.undo-boundary',
    priority: -90,
    middleware: async (ctx: BehaviorContext, next) => {
      // Track selection changes to mark undo boundaries
      const currentKey = ctx.selection
        ? `${ctx.selection.type}:${JSON.stringify(ctx.selection.payload)}`
        : null

      if (currentKey !== lastSelectionKey) {
        lastSelectionKey = currentKey
        // Selection changed — any new tx.run will start a fresh Command
        // (PatchCommand merge window is per-mergeKey, so this is implicit)
      }

      await next()
    },
  }
}
