import type { MaterialGeometry, Selection } from '@easyink/core'
import type { MaterialNode, TableNode } from '@easyink/schema'
import type { TableCellPayload, TableEditingDelegate } from './types'
import { isTableNode } from '@easyink/schema'
import { computeCellRect, computeColumnWidths, computeRowScaleWithVirtualRows, hitTestGridCell } from '../geometry'
import { resolveMergeOwner } from '../topology'

/**
 * Compute the height occupied by virtual placeholder rows inside node.height.
 * Returns 0 when there are no placeholder rows.
 *
 * The placeholder row inherits the scaled height of the repeat-template row.
 * Virtual rows participate in the same height distribution as schema rows, so
 * they never increase the element footprint.
 */
export function computePlaceholderHeight(
  node: TableNode,
  placeholderCount: number,
  hidden?: readonly boolean[],
): number {
  if (placeholderCount <= 0)
    return 0
  const repeatRow = node.table.topology.rows.find(r => r.role === 'repeat-template')
  if (!repeatRow)
    return 0
  const rowScale = computeRowScaleWithVirtualRows(
    node.table.topology.rows,
    node.height,
    hidden,
    { rowHeight: repeatRow.height, count: placeholderCount },
  )
  return repeatRow.height * rowScale * placeholderCount
}

function computeRowHeightsWithPlaceholders(node: TableNode, placeholderCount: number, hidden?: readonly boolean[]): number[] {
  const repeatRow = node.table.topology.rows.find(r => r.role === 'repeat-template')
  const rowScale = computeRowScaleWithVirtualRows(
    node.table.topology.rows,
    node.height,
    hidden,
    repeatRow ? { rowHeight: repeatRow.height, count: placeholderCount } : undefined,
  )
  return node.table.topology.rows.map((row, index) => hidden?.[index] ? 0 : row.height * rowScale)
}

function hitTestGridCellWithRowHeights(
  node: TableNode,
  relX: number,
  relY: number,
  rowHeights: readonly number[],
): { row: number, col: number } | null {
  if (relX < 0 || relY < 0 || relX > node.width || relY > node.height)
    return null

  const colWidths = computeColumnWidths(node.table.topology.columns, node.width)

  let col = -1
  let accX = 0
  for (let c = 0; c < colWidths.length; c++) {
    if (relX >= accX && relX < accX + colWidths[c]!) {
      col = c
      break
    }
    accX += colWidths[c]!
  }
  if (col < 0)
    col = colWidths.length - 1

  let row = -1
  let accY = 0
  for (let r = 0; r < rowHeights.length; r++) {
    const h = rowHeights[r]!
    if (h <= 0)
      continue
    if (relY >= accY && relY < accY + h) {
      row = r
      break
    }
    accY += h
  }
  if (row < 0) {
    for (let r = rowHeights.length - 1; r >= 0; r--) {
      if (rowHeights[r]! > 0) {
        row = r
        break
      }
    }
  }
  return row >= 0 ? { row, col } : null
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
  hidden?: readonly boolean[],
): { x: number, y: number, w: number, h: number } | null {
  const rect = computeCellRect(node.table.topology, node.width, node.height, row, col, hidden)
  if (!rect)
    return null

  if (placeholderCount <= 0)
    return rect

  const repeatIdx = node.table.topology.rows.findIndex(r => r.role === 'repeat-template')
  if (repeatIdx < 0 || row <= repeatIdx)
    return computeCellRectWithRowHeights(node, row, col, computeRowHeightsWithPlaceholders(node, placeholderCount, hidden))

  const adjustedRect = computeCellRectWithRowHeights(node, row, col, computeRowHeightsWithPlaceholders(node, placeholderCount, hidden))
  if (!adjustedRect)
    return null
  const ph = computePlaceholderHeight(node, placeholderCount, hidden)
  return { x: adjustedRect.x, y: adjustedRect.y + ph, w: adjustedRect.w, h: adjustedRect.h }
}

function computeCellRectWithRowHeights(
  node: TableNode,
  row: number,
  col: number,
  rowHeights: readonly number[],
): { x: number, y: number, w: number, h: number } | null {
  const { columns, rows } = node.table.topology
  if (row >= rows.length || col >= columns.length || rowHeights[row]! <= 0)
    return null

  const colWidths = computeColumnWidths(columns, node.width)
  let x = 0
  for (let c = 0; c < col; c++)
    x += colWidths[c]!

  let y = 0
  for (let r = 0; r < row; r++)
    y += rowHeights[r]!

  const cell = rows[row]!.cells[col]
  const colSpan = cell?.colSpan ?? 1
  const rowSpan = cell?.rowSpan ?? 1
  let w = 0
  for (let c = col; c < Math.min(col + colSpan, columns.length); c++)
    w += colWidths[c]!
  let h = 0
  for (let r = row; r < Math.min(row + rowSpan, rows.length); r++)
    h += rowHeights[r]!
  return { x, y, w, h }
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
  hidden?: readonly boolean[],
): { row: number, col: number } | null {
  if (placeholderCount <= 0)
    return hitTestGridCell(node.table.topology, node.width, node.height, relX, relY, hidden)

  const repeatIdx = node.table.topology.rows.findIndex(r => r.role === 'repeat-template')
  if (repeatIdx < 0)
    return hitTestGridCell(node.table.topology, node.width, node.height, relX, relY, hidden)

  const ph = computePlaceholderHeight(node, placeholderCount, hidden)
  const rowHeights = computeRowHeightsWithPlaceholders(node, placeholderCount, hidden)

  let repeatBottom = 0
  for (let i = 0; i <= repeatIdx; i++) {
    repeatBottom += rowHeights[i]!
  }

  if (relY <= repeatBottom)
    return hitTestGridCellWithRowHeights(node, relX, relY, rowHeights)

  if (relY <= repeatBottom + ph)
    return null

  return hitTestGridCellWithRowHeights(node, relX, relY - ph, rowHeights)
}

/**
 * Create a MaterialGeometry implementation for table editing.
 *
 * Coordinate convention (per architecture §22.4):
 * - getContentLayout / resolveLocation return document coords
 * - hitTest receives material-local coords (already converted by GeometryService.documentToLocal)
 */
export function createTableGeometry(delegate: TableEditingDelegate): MaterialGeometry {
  const getHidden = (node: TableNode) => delegate.getHiddenRowMask?.(node)

  return {
    getContentLayout(node: MaterialNode) {
      if (!isTableNode(node)) {
        return { contentBox: { x: node.x, y: node.y, width: node.width, height: node.height } }
      }
      return {
        contentBox: { x: node.x, y: node.y, width: node.width, height: node.height },
      }
    },

    resolveLocation(selection: Selection, node: MaterialNode) {
      if (!isTableNode(node))
        return []

      const payload = selection.payload as TableCellPayload
      const hidden = getHidden(node)
      const rect = computeCellRectWithPlaceholders(node, payload.row, payload.col, delegate.getPlaceholderRowCount(), hidden)
      if (!rect)
        return []

      // Translate node-local rect to document coords so SelectionOverlay can render it
      // directly with absolute positioning under the page element.
      return [{ x: rect.x + node.x, y: rect.y + node.y, width: rect.w, height: rect.h }]
    },

    hitTest(point, node: MaterialNode) {
      if (!isTableNode(node))
        return null

      const hidden = getHidden(node)
      const gridCell = hitTestWithPlaceholders(node, point.x, point.y, delegate.getPlaceholderRowCount(), hidden)
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
