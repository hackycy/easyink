import type { TableTopologySchema } from '@easyink/schema'

/**
 * Resolve a grid position to the merge-owner (primary) cell.
 * If the cell at (row, col) is spanned by another cell's rowSpan/colSpan,
 * returns the top-left cell that owns the merge. Otherwise returns (row, col).
 */
export function resolveMergeOwner(topology: TableTopologySchema, row: number, col: number): { row: number, col: number } {
  const { rows } = topology
  for (let r = 0; r <= row; r++) {
    const rowCells = rows[r]?.cells
    if (!rowCells)
      continue
    for (let c = 0; c <= col; c++) {
      const cell = rowCells[c]
      if (!cell)
        continue
      const rs = cell.rowSpan ?? 1
      const cs = cell.colSpan ?? 1
      if (rs > 1 || cs > 1) {
        if (row >= r && row < r + rs && col >= c && col < c + cs) {
          return { row: r, col: c }
        }
      }
    }
  }
  return { row, col }
}

/**
 * Get the next primary cell in row-major order, skipping spanned-away cells.
 */
export function getNextCell(topology: TableTopologySchema, currentRow: number, currentCol: number): { row: number, col: number } {
  const totalCols = topology.columns.length
  const totalRows = topology.rows.length
  const totalCells = totalRows * totalCols

  let nextCol = currentCol + 1
  let nextRow = currentRow

  for (let i = 0; i < totalCells; i++) {
    if (nextCol >= totalCols) {
      nextCol = 0
      nextRow++
      if (nextRow >= totalRows) {
        nextRow = 0
      }
    }

    const owner = resolveMergeOwner(topology, nextRow, nextCol)
    if (owner.row === nextRow && owner.col === nextCol) {
      if (nextRow !== currentRow || nextCol !== currentCol) {
        return { row: nextRow, col: nextCol }
      }
    }

    nextCol++
  }

  return { row: currentRow, col: currentCol }
}
