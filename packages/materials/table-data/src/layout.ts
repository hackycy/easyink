import type { MaterialNode, TableNode } from '@easyink/schema'
import { computeRowScale } from '@easyink/material-table-kernel'
import { isTableNode } from '@easyink/schema'

export const TABLE_DATA_PLACEHOLDER_ROW_COUNT = 2

export function getTableDataPlaceholderHeight(node: MaterialNode, placeholderRowCount = TABLE_DATA_PLACEHOLDER_ROW_COUNT): number {
  if (!isTableNode(node) || node.type !== 'table-data' || placeholderRowCount <= 0)
    return 0

  const repeatRow = node.table.topology.rows.find(row => row.role === 'repeat-template')
  if (!repeatRow)
    return 0

  const scale = computeRowScale(node.table.topology.rows, node.height)
  return repeatRow.height * scale * placeholderRowCount
}

export function getTableDataDesignerVisualHeight(node: MaterialNode, placeholderRowCount = TABLE_DATA_PLACEHOLDER_ROW_COUNT): number {
  if (!isTableNode(node) || node.type !== 'table-data')
    return node.height
  return node.height + getTableDataPlaceholderHeight(node, placeholderRowCount)
}

export function isTableDataNodeForLayout(node: MaterialNode): node is TableNode {
  return isTableNode(node) && node.type === 'table-data'
}
