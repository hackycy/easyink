import type { MaterialNode, TableDataSchema, TableNode } from '@easyink/schema'
import { computeRowScaleWithVirtualRows } from '@easyink/material-table-kernel'
import { isTableNode } from '@easyink/schema'

export const TABLE_DATA_PLACEHOLDER_ROW_COUNT = 2

/**
 * Build per-row hidden mask aligned with `node.table.topology.rows`.
 * Mirrors the logic in designer.ts so layout helpers and designer agree on
 * which rows contribute to height/scale.
 */
function buildHiddenMask(node: TableNode): boolean[] {
  const td = node.table as TableDataSchema
  const headerHidden = td.showHeader === false
  const footerHidden = td.showFooter === false
  return node.table.topology.rows.map((row) => {
    if (row.role === 'header')
      return headerHidden
    if (row.role === 'footer')
      return footerHidden
    return false
  })
}

export function getTableDataPlaceholderHeight(node: MaterialNode, placeholderRowCount = TABLE_DATA_PLACEHOLDER_ROW_COUNT): number {
  if (!isTableNode(node) || node.type !== 'table-data' || placeholderRowCount <= 0)
    return 0

  const repeatRow = node.table.topology.rows.find(row => row.role === 'repeat-template')
  if (!repeatRow)
    return 0

  const hidden = buildHiddenMask(node)
  const scale = computeRowScaleWithVirtualRows(
    node.table.topology.rows,
    node.height,
    hidden,
    { rowHeight: repeatRow.height, count: placeholderRowCount },
  )
  return repeatRow.height * scale * placeholderRowCount
}

export function isTableDataNodeForLayout(node: MaterialNode): node is TableNode {
  return isTableNode(node) && node.type === 'table-data'
}
