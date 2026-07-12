import type { MaterialResizeAdapter, MaterialResizeSideEffect } from '@easyink/core'
import type { MaterialNode } from '@easyink/schema'
import { isEditableTableNode, tableModel, tableProjection } from './editing/canonical'

export interface TableResizeSnapshot {
  rowHeights: number[]
  hiddenMask: boolean[]
  originalNodeHeight: number
}

export interface CreateTableResizeAdapterOptions {
  getHiddenRowMask: (node: MaterialNode<unknown>) => boolean[]
}

export function createTableResizeAdapter({ getHiddenRowMask }: CreateTableResizeAdapterOptions): MaterialResizeAdapter {
  return {
    beginResize(node) {
      if (!isEditableTableNode(node))
        return null
      return {
        rowHeights: tableProjection(node).topology.rows.map(row => row.height),
        hiddenMask: getHiddenRowMask(node),
        originalNodeHeight: node.height,
      } satisfies TableResizeSnapshot
    },

    applyResize(node, snapshot, params) {
      const snap = snapshot as TableResizeSnapshot | null
      if (!snap || !isEditableTableNode(node) || params.newHeight === params.originalHeight)
        return
      const scale = params.newHeight / params.originalHeight
      const projection = tableProjection(node)
      const model = tableModel(node)
      projection.rowIds.forEach((rowId, index) => {
        if (snap.hiddenMask[index])
          return
        const row = model.bands.flatMap(band => band.rows).find(candidate => candidate.id === rowId)
        if (row)
          row.minHeight = snap.rowHeights[index]! * scale
      })
    },

    commitResize(node, snapshot) {
      const snap = snapshot as TableResizeSnapshot | null
      if (!snap || !isEditableTableNode(node))
        return null
      const projection = tableProjection(node)
      const finalRowHeights = projection.topology.rows.map(row => row.height)
      const rowIds = [...projection.rowIds]
      const apply = (target: MaterialNode, heights: number[]) => {
        const model = tableModel(target)
        rowIds.forEach((rowId, index) => {
          const row = model.bands.flatMap(band => band.rows).find(candidate => candidate.id === rowId)
          if (row)
            row.minHeight = heights[index]!
        })
      }
      return {
        apply: target => apply(target, finalRowHeights),
        undo: target => apply(target, snap.rowHeights),
      } satisfies MaterialResizeSideEffect
    },
  }
}
