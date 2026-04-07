import type { TableNode } from '@easyink/schema'
import type { DesignerStore } from '../store/designer-store'
import { UnitManager } from '@easyink/core'
import { isTableNode } from '@easyink/schema'

export interface TableInteractionContext {
  store: DesignerStore
  getPageEl: () => HTMLElement | null
}

/**
 * Table interaction composable: state machine driver + cell hitTest.
 * Architecture ref: 10.7 (table deep editing)
 */
export function useTableInteraction(ctx: TableInteractionContext) {
  /**
   * Handle click on a table element's body area to determine cell selection.
   * Call this when a table is already in table-selected phase and user clicks inside it.
   */
  function onTableCellClick(e: PointerEvent, tableNode: TableNode, elementEl: HTMLElement) {
    const { store } = ctx
    const cell = hitTestCell(e, tableNode, elementEl, store)
    if (!cell)
      return

    store.selectCell(cell.row, cell.col)
  }

  /** Handle double-click on a cell to enter content editing. */
  function onTableCellDoubleClick(_e: PointerEvent, _tableNode: TableNode) {
    const { store } = ctx
    if (store.tableEditing.phase === 'cell-selected') {
      store.enterContentEditing()
    }
  }

  /** Handle keyboard events during table editing. */
  function onTableKeyDown(e: KeyboardEvent) {
    const { store } = ctx
    const { phase, tableId, cellPath } = store.tableEditing

    if (phase === 'idle')
      return

    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      if (phase === 'content-editing') {
        store.exitContentEditing()
      }
      else if (phase === 'cell-selected') {
        // Back to table-selected
        store.tableEditing.phase = 'table-selected'
        store.tableEditing.cellPath = undefined
        store.tableEditing.sectionKind = undefined
      }
      else if (phase === 'table-selected') {
        store.exitDeepEditing()
      }
      return
    }

    if (phase === 'cell-selected' && cellPath && tableId) {
      const node = store.getElementById(tableId)
      if (!node || !isTableNode(node))
        return

      if (e.key === 'Tab') {
        e.preventDefault()
        const next = getNextCell(node, cellPath.row, cellPath.col)
        store.selectCell(next.row, next.col)
        return
      }

      if (e.key === 'Enter') {
        e.preventDefault()
        store.enterContentEditing()
        return
      }

      if (e.key === 'Delete') {
        e.preventDefault()
        // Clear cell content - handled by TableCellEditor or caller
      }
    }
  }

  /** Handle click outside the table to exit deep editing. */
  function onOutsideClick() {
    const { store } = ctx
    if (store.isInDeepEditing) {
      store.exitDeepEditing()
    }
  }

  return {
    onTableCellClick,
    onTableCellDoubleClick,
    onTableKeyDown,
    onOutsideClick,
  }
}

/**
 * Resolve a grid position to the merge-owner (primary) cell.
 * If the cell at (row, col) is spanned by another cell's rowSpan/colSpan,
 * returns the top-left cell that owns the merge. Otherwise returns (row, col).
 */
export function resolveMergeOwner(node: TableNode, row: number, col: number): { row: number, col: number } {
  const { rows } = node.table.topology
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
        // This cell owns a merged region [r..r+rs-1, c..c+cs-1]
        if (row >= r && row < r + rs && col >= c && col < c + cs) {
          return { row: r, col: c }
        }
      }
    }
  }
  return { row, col }
}

/**
 * HitTest: determine which cell was clicked based on pointer position.
 * Converts screen coordinates to document coordinates, then walks columns/rows.
 * Resolves merged cells to their owner (primary) cell.
 */
function hitTestCell(
  e: PointerEvent,
  tableNode: TableNode,
  elementEl: HTMLElement,
  store: DesignerStore,
): { row: number, col: number } | null {
  const pageEl = elementEl.closest('.ei-canvas-page') as HTMLElement | null
  if (!pageEl)
    return null

  const unitManager = new UnitManager(store.schema.unit)
  const zoom = store.workbench.viewport.zoom
  const pageRect = pageEl.getBoundingClientRect()

  // Convert pointer to document coordinates
  const docX = unitManager.screenToDocument(e.clientX, pageRect.left, 0, zoom)
  const docY = unitManager.screenToDocument(e.clientY, pageRect.top, 0, zoom)

  // Relative to table element
  const relX = docX - tableNode.x
  const relY = docY - tableNode.y

  if (relX < 0 || relY < 0 || relX > tableNode.width || relY > tableNode.height)
    return null

  const { topology } = tableNode.table

  // Normalize column ratios (sum may != 1 after column resize)
  let totalColRatio = 0
  for (const col of topology.columns)
    totalColRatio += col.ratio
  if (totalColRatio === 0)
    totalColRatio = 1

  // Find column
  let col = -1
  let accX = 0
  for (let c = 0; c < topology.columns.length; c++) {
    const colWidth = (topology.columns[c]!.ratio / totalColRatio) * tableNode.width
    if (relX >= accX && relX < accX + colWidth) {
      col = c
      break
    }
    accX += colWidth
  }
  if (col < 0)
    col = topology.columns.length - 1

  // Find row (proportional distribution to match browser table layout)
  let totalRowHeight = 0
  for (const r of topology.rows)
    totalRowHeight += r.height
  const rowScale = totalRowHeight > 0 ? tableNode.height / totalRowHeight : 1

  let row = -1
  let accY = 0
  for (let r = 0; r < topology.rows.length; r++) {
    const rowHeight = topology.rows[r]!.height * rowScale
    if (relY >= accY && relY < accY + rowHeight) {
      row = r
      break
    }
    accY += rowHeight
  }
  if (row < 0)
    row = topology.rows.length - 1

  // Resolve to merge-owner cell so we never select a phantom (spanned-away) cell
  return resolveMergeOwner(tableNode, row, col)
}

/** Get the next primary cell in row-major order, skipping spanned-away cells. */
function getNextCell(node: TableNode, currentRow: number, currentCol: number): { row: number, col: number } {
  const { topology } = node.table
  const totalCols = topology.columns.length
  const totalRows = topology.rows.length
  const totalCells = totalRows * totalCols

  let nextCol = currentCol + 1
  let nextRow = currentRow

  // Walk forward, skipping spanned-away cells, up to one full cycle
  for (let i = 0; i < totalCells; i++) {
    if (nextCol >= totalCols) {
      nextCol = 0
      nextRow++
      if (nextRow >= totalRows) {
        nextRow = 0
      }
    }

    const owner = resolveMergeOwner(node, nextRow, nextCol)
    // Accept the cell only if it's the primary (top-left) position and not the current cell
    if (owner.row === nextRow && owner.col === nextCol) {
      if (nextRow !== currentRow || nextCol !== currentCol) {
        return { row: nextRow, col: nextCol }
      }
    }

    nextCol++
  }

  // Fallback: only one cell in the table
  return { row: currentRow, col: currentCol }
}
