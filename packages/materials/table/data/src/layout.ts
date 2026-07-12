import type { MaterialNode } from '@easyink/schema'
import { computeRowScaleWithVirtualRows, projectTableTopology } from '@easyink/material-table-kernel'

export const TABLE_DATA_PLACEHOLDER_ROW_COUNT = 2

/**
 * Build per-row hidden mask aligned with `node.model.topology.rows`.
 * Mirrors the logic in designer.ts so layout helpers and designer agree on
 * which rows contribute to height/scale.
 */
export function getTableDataPlaceholderHeight(node: MaterialNode<unknown>, placeholderRowCount = TABLE_DATA_PLACEHOLDER_ROW_COUNT): number {
  if (node.type !== 'table-data' || placeholderRowCount <= 0)
    return 0

  const { topology } = projectTableTopology(node)
  const repeatRow = topology.rows.find(row => row.role === 'repeat-template')
  if (!repeatRow)
    return 0

  const hidden = topology.rows.map(() => false)
  const scale = computeRowScaleWithVirtualRows(
    topology.rows,
    node.height,
    hidden,
    { rowHeight: repeatRow.height, count: placeholderRowCount },
  )
  return repeatRow.height * scale * placeholderRowCount
}

export function isTableDataNodeForLayout(node: MaterialNode<unknown>): boolean {
  return node.type === 'table-data'
}
