import type { Selection, SelectionType } from '@easyink/core'
import type { MaterialNode, TableNode } from '@easyink/schema'
import type { TableCellPayload, TableEditingDelegate } from './types'
import { isTableNode } from '@easyink/schema'
import { createCellSubPropertySchema } from './cell-property'
import { computeCellRectWithPlaceholders } from './geometry'

/**
 * SelectionType for table cells.
 * Registered by both table-static and table-data materials.
 */
export function createTableCellSelectionType(delegate: TableEditingDelegate): SelectionType<TableCellPayload> {
  return {
    id: 'table.cell',

    validate(payload: unknown): payload is TableCellPayload {
      if (typeof payload !== 'object' || payload === null)
        return false
      const p = payload as Record<string, unknown>
      return typeof p.row === 'number' && typeof p.col === 'number'
    },

    resolveLocation(sel: Selection<TableCellPayload>, node: MaterialNode) {
      if (!isTableNode(node))
        return []

      const rect = computeCellRectWithPlaceholders(
        node as TableNode,
        sel.payload.row,
        sel.payload.col,
        delegate.getPlaceholderRowCount(),
      )
      if (!rect)
        return []

      // Canvas coords (page-relative) — see createTableGeometry.resolveLocation
      return [{ x: rect.x + node.x, y: rect.y + node.y, width: rect.w, height: rect.h }]
    },

    getPropertySchema(sel: Selection<TableCellPayload>, node: MaterialNode) {
      return createCellSubPropertySchema(sel, node, delegate)
    },
  }
}
