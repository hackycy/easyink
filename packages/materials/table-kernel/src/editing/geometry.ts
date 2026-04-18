import type { MaterialGeometry, Selection } from '@easyink/core'
import type { MaterialNode, TableNode } from '@easyink/schema'
import type { TableCellPayload, TableEditingDelegate } from './types'
import { isTableNode } from '@easyink/schema'
import { computeCellRect, computeRowScale, hitTestGridCell } from '../geometry'
import { resolveMergeOwner } from '../topology'

/**
 * Compute extra visual height from virtual placeholder rows.
 * Returns 0 when there are no placeholder rows.
 */
export function computePlaceholderHeight(node: TableNode, placeholderCount: number): number {
  if (placeholderCount <= 0)
    return 0
  const repeatRow = node.table.topology.rows.find(r => r.role === 'repeat-template')
  if (!repeatRow)
    return 0
  const rowScale = computeRowScale(node.table.topology.rows, node.height)
  return repeatRow.height * rowScale * placeholderCount
}

/**
 * Compute cell rect adjusted for virtual placeholder rows.
 * Footer cells (after repeat-template) are offset downward.
 */
export function computeCellRectWithPlaceholders(
  node: TableNode,
  row: number,
  col: number,
  placeholderCount: number,
): { x: number, y: number, w: number, h: number } | null {
  const rect = computeCellRect(node.table.topology, node.width, node.height, row, col)
  if (!rect)
    return null

  if (placeholderCount <= 0)
    return rect

  const repeatIdx = node.table.topology.rows.findIndex(r => r.role === 'repeat-template')
  if (repeatIdx < 0 || row <= repeatIdx)
    return rect

  const ph = computePlaceholderHeight(node, placeholderCount)
  return { x: rect.x, y: rect.y + ph, w: rect.w, h: rect.h }
}

/**
 * Hit-test adjusted for virtual placeholder rows.
 * Points in the placeholder region return null (inert).
 * Points in the footer region are remapped by subtracting placeholder height.
 */
export function hitTestWithPlaceholders(
  node: TableNode,
  relX: number,
  relY: number,
  placeholderCount: number,
): { row: number, col: number } | null {
  if (placeholderCount <= 0)
    return hitTestGridCell(node.table.topology, node.width, node.height, relX, relY)

  const repeatIdx = node.table.topology.rows.findIndex(r => r.role === 'repeat-template')
  if (repeatIdx < 0)
    return hitTestGridCell(node.table.topology, node.width, node.height, relX, relY)

  const ph = computePlaceholderHeight(node, placeholderCount)
  const rowScale = computeRowScale(node.table.topology.rows, node.height)

  let repeatBottom = 0
  for (let i = 0; i <= repeatIdx; i++)
    repeatBottom += node.table.topology.rows[i]!.height * rowScale

  if (relY <= repeatBottom)
    return hitTestGridCell(node.table.topology, node.width, node.height, relX, relY)

  if (relY <= repeatBottom + ph)
    return null

  return hitTestGridCell(node.table.topology, node.width, node.height, relX, relY - ph)
}

/**
 * Create a MaterialGeometry implementation for table editing.
 *
 * Coordinate convention (per architecture §22.4):
 * - getContentLayout / resolveLocation return canvas (page-relative) coords
 * - hitTest receives material-local coords (already converted by GeometryService.canvasToLocal)
 */
export function createTableGeometry(delegate: TableEditingDelegate): MaterialGeometry {
  return {
    getContentLayout(node: MaterialNode) {
      if (!isTableNode(node)) {
        return { contentBox: { x: node.x, y: node.y, width: node.width, height: node.height } }
      }
      const ph = computePlaceholderHeight(node, delegate.getPlaceholderRowCount())
      return {
        contentBox: { x: node.x, y: node.y, width: node.width, height: node.height + ph },
      }
    },

    resolveLocation(selection: Selection, node: MaterialNode) {
      if (!isTableNode(node))
        return []

      const payload = selection.payload as TableCellPayload
      const rect = computeCellRectWithPlaceholders(node, payload.row, payload.col, delegate.getPlaceholderRowCount())
      if (!rect)
        return []

      // Translate node-local rect to canvas coords so SelectionOverlay can render it
      // directly with absolute positioning under the page element.
      return [{ x: rect.x + node.x, y: rect.y + node.y, width: rect.w, height: rect.h }]
    },

    hitTest(point, node: MaterialNode) {
      if (!isTableNode(node))
        return null

      const gridCell = hitTestWithPlaceholders(node, point.x, point.y, delegate.getPlaceholderRowCount())
      if (!gridCell)
        return null

      const owner = resolveMergeOwner(node.table.topology, gridCell.row, gridCell.col)
      return {
        type: 'table.cell',
        nodeId: node.id,
        payload: { row: owner.row, col: owner.col } as TableCellPayload,
      }
    },
  }
}
