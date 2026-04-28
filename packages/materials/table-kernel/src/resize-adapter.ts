import type { MaterialResizeAdapter, MaterialResizeSideEffect } from '@easyink/core'
import type { MaterialNode, TableNode } from '@easyink/schema'
import { isTableNode } from '@easyink/schema'

/**
 * Snapshot captured at resize start: original row heights and per-row hidden mask.
 * Hidden rows (header/footer when `showHeader/showFooter` is false) keep their
 * schema height frozen so that re-showing them preserves topology proportions.
 */
export interface TableResizeSnapshot {
  rowHeights: number[]
  hiddenMask: boolean[]
  originalNodeHeight: number
}

export interface CreateTableResizeAdapterOptions {
  /** Compute hidden-row mask for the given table node (mirrors render-time mask). */
  getHiddenRowMask: (node: TableNode) => boolean[]
}

/**
 * Build a `MaterialResizeAdapter` for table-* nodes.
 *
 * Behavior:
 *  - During vertical resize, visible row heights scale by `newH / origH`;
 *    hidden rows keep their schema height untouched.
 *  - The committed side effect re-applies the post-resize row heights on
 *    redo, and restores the original row heights on undo.
 */
export function createTableResizeAdapter({
  getHiddenRowMask,
}: CreateTableResizeAdapterOptions): MaterialResizeAdapter {
  return {
    beginResize(node) {
      if (!isTableNode(node))
        return null
      const snapshot: TableResizeSnapshot = {
        rowHeights: node.table.topology.rows.map(r => r.height),
        hiddenMask: getHiddenRowMask(node),
        originalNodeHeight: node.height,
      }
      return snapshot
    },

    applyResize(node, snapshot, params) {
      const snap = snapshot as TableResizeSnapshot | null
      if (!snap || !isTableNode(node))
        return
      const { newHeight, originalHeight } = params
      if (newHeight === originalHeight)
        return
      const scale = newHeight / originalHeight
      const rows = node.table.topology.rows
      for (let i = 0; i < rows.length; i++) {
        if (snap.hiddenMask[i])
          continue
        rows[i]!.height = snap.rowHeights[i]! * scale
      }
    },

    commitResize(node, snapshot) {
      const snap = snapshot as TableResizeSnapshot | null
      if (!snap || !isTableNode(node))
        return null
      const finalRowHeights = node.table.topology.rows.map(r => r.height)
      const originalRowHeights = snap.rowHeights.slice()

      const sideEffect: MaterialResizeSideEffect = {
        apply(target: MaterialNode) {
          if (!isTableNode(target))
            return
          const rows = target.table.topology.rows
          for (let i = 0; i < rows.length && i < finalRowHeights.length; i++) {
            rows[i]!.height = finalRowHeights[i]!
          }
        },
        undo(target: MaterialNode) {
          if (!isTableNode(target))
            return
          const rows = target.table.topology.rows
          for (let i = 0; i < rows.length && i < originalRowHeights.length; i++) {
            rows[i]!.height = originalRowHeights[i]!
          }
        },
      }
      return sideEffect
    },
  }
}
