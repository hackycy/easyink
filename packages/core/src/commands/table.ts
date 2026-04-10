import type { BindingRef, TableCellSchema, TableDataSchema, TableNode, TableRowSchema } from '@easyink/schema'
import type { TableRowRole } from '@easyink/shared'
import type { Command } from '../command'
import { isTableDataNode } from '@easyink/schema'
import { deepClone, generateId } from '@easyink/shared'
import { asRecord } from './helpers'

// ─── Table Commands ─────────────────────────────────────────────────

/** Validate merge operation: cross-role check + table-data zone restrictions. */
export function validateMerge(node: TableNode, anchorRow: number, _anchorCol: number, rowSpan: number, _colSpan: number): boolean {
  const rows = node.table.topology.rows

  // 1. Cross-role check: all rows in selection must have the same role
  const roles = new Set<string>()
  for (let r = anchorRow; r < anchorRow + rowSpan && r < rows.length; r++) {
    roles.add(rows[r]!.role)
  }
  if (roles.size > 1)
    return false

  // 2. table-data specific constraints
  if (isTableDataNode(node)) {
    const role = rows[anchorRow]!.role
    // Data area: merge completely forbidden
    if (role === 'repeat-template')
      return false
    // Header/footer: only column-direction merge allowed
    if ((role === 'header' || role === 'footer') && rowSpan > 1)
      return false
  }

  return true
}

/** Count rows with a given role in a table. */
function countRowsWithRole(node: TableNode, role: TableRowRole): number {
  return node.table.topology.rows.filter(r => r.role === role).length
}

/** Insert a row into the table topology. New row inherits role from adjacent row. */
export class InsertTableRowCommand implements Command {
  readonly id = generateId('cmd')
  readonly type = 'insert-table-row'
  readonly description = 'Insert table row'

  constructor(
    private node: TableNode,
    private rowIndex: number,
    private row: TableRowSchema,
  ) {}

  private rejected = false

  execute(): void {
    // table-data: reject if inserting a header/footer row and one already exists
    if (isTableDataNode(this.node)) {
      const role = this.row.role
      if ((role === 'header' || role === 'footer') && countRowsWithRole(this.node, role) >= 1) {
        this.rejected = true
        return
      }
    }
    this.node.table.topology.rows.splice(this.rowIndex, 0, this.row)
    this.node.height += this.row.height
  }

  undo(): void {
    if (this.rejected)
      return
    this.node.table.topology.rows.splice(this.rowIndex, 1)
    this.node.height -= this.row.height
  }
}

/** Remove a row from the table topology. */
export class RemoveTableRowCommand implements Command {
  readonly id = generateId('cmd')
  readonly type = 'remove-table-row'
  readonly description = 'Remove table row'
  private snapshot: TableRowSchema | undefined
  private oldHeight = 0

  constructor(
    private node: TableNode,
    private rowIndex: number,
  ) {}

  execute(): void {
    const rows = this.node.table.topology.rows
    this.snapshot = deepClone(rows[this.rowIndex]!)
    this.oldHeight = this.node.height
    this.node.height -= rows[this.rowIndex]!.height
    rows.splice(this.rowIndex, 1)
  }

  undo(): void {
    if (!this.snapshot)
      return
    this.node.table.topology.rows.splice(this.rowIndex, 0, this.snapshot)
    this.node.height = this.oldHeight
  }
}

/** Insert a column. Adds a cell to each row, adjusts existing colSpan, re-normalizes ratios. */
export class InsertTableColumnCommand implements Command {
  readonly id = generateId('cmd')
  readonly type = 'insert-table-column'
  readonly description = 'Insert table column'
  private oldColumns: Array<{ ratio: number }> = []
  private oldWidth = 0
  private affectedMerges: Array<{ rowIndex: number, cellIndex: number, oldColSpan: number }> = []

  constructor(
    private node: TableNode,
    private colIndex: number,
  ) {}

  execute(): void {
    const { topology } = this.node.table
    this.oldColumns = deepClone(topology.columns)
    this.oldWidth = this.node.width

    // Insert new column with equal share
    const newRatio = 1 / (topology.columns.length + 1)
    // Scale existing ratios down proportionally
    const scale = topology.columns.length / (topology.columns.length + 1)
    for (const col of topology.columns) {
      col.ratio *= scale
    }
    topology.columns.splice(this.colIndex, 0, { ratio: newRatio })

    // Increase element width proportionally
    this.node.width = this.oldWidth / scale

    // Insert a cell in each row
    for (const row of topology.rows) {
      const emptyCell: TableCellSchema = {}
      row.cells.splice(this.colIndex, 0, emptyCell)
    }

    // Adjust colSpan of merged cells that span across the insertion point
    this.affectedMerges = []
    for (let ri = 0; ri < topology.rows.length; ri++) {
      const row = topology.rows[ri]!
      let colPos = 0
      for (let ci = 0; ci < row.cells.length; ci++) {
        const cell = row.cells[ci]!
        const span = cell.colSpan ?? 1
        if (ci !== this.colIndex && colPos < this.colIndex && colPos + span > this.colIndex) {
          this.affectedMerges.push({ rowIndex: ri, cellIndex: ci, oldColSpan: span })
          cell.colSpan = span + 1
        }
        colPos += span
      }
    }
  }

  undo(): void {
    const { topology } = this.node.table
    // Restore colSpan
    for (const m of this.affectedMerges) {
      const cell = topology.rows[m.rowIndex]!.cells[m.cellIndex]!
      cell.colSpan = m.oldColSpan
    }
    // Remove inserted cells
    for (const row of topology.rows) {
      row.cells.splice(this.colIndex, 1)
    }
    // Restore columns
    topology.columns = this.oldColumns
    this.node.width = this.oldWidth
  }
}

/** Remove a column. Removes a cell from each row, adjusts colSpan, re-normalizes ratios. */
export class RemoveTableColumnCommand implements Command {
  readonly id = generateId('cmd')
  readonly type = 'remove-table-column'
  readonly description = 'Remove table column'
  private oldColumns: Array<{ ratio: number }> = []
  private oldWidth = 0
  private removedCells: Array<{ rowIndex: number, cell: TableCellSchema }> = []
  private affectedMerges: Array<{ rowIndex: number, cellIndex: number, oldColSpan: number }> = []

  constructor(
    private node: TableNode,
    private colIndex: number,
  ) {}

  execute(): void {
    const { topology } = this.node.table
    if (topology.columns.length <= 1)
      return

    this.oldColumns = deepClone(topology.columns)
    this.oldWidth = this.node.width

    // Shrink colSpan for merged cells that span the deleted column
    this.affectedMerges = []
    for (let ri = 0; ri < topology.rows.length; ri++) {
      const row = topology.rows[ri]!
      let colPos = 0
      for (let ci = 0; ci < row.cells.length; ci++) {
        const cell = row.cells[ci]!
        const span = cell.colSpan ?? 1
        if (ci !== this.colIndex && colPos <= this.colIndex && colPos + span > this.colIndex) {
          this.affectedMerges.push({ rowIndex: ri, cellIndex: ci, oldColSpan: span })
          cell.colSpan = span - 1
          if (cell.colSpan <= 1)
            cell.colSpan = undefined
        }
        colPos += span
      }
    }

    // Save and remove cells
    this.removedCells = []
    for (let ri = 0; ri < topology.rows.length; ri++) {
      const row = topology.rows[ri]!
      if (this.colIndex < row.cells.length) {
        this.removedCells.push({ rowIndex: ri, cell: deepClone(row.cells[this.colIndex]!) })
        row.cells.splice(this.colIndex, 1)
      }
    }

    // Remove column and re-normalize ratios
    const removedRatio = topology.columns[this.colIndex]!.ratio
    topology.columns.splice(this.colIndex, 1)
    const remaining = 1 - removedRatio
    if (remaining > 0) {
      for (const col of topology.columns) {
        col.ratio = col.ratio / remaining
      }
    }

    // Adjust element width
    this.node.width = this.oldWidth * remaining
  }

  undo(): void {
    const { topology } = this.node.table
    // Restore columns
    topology.columns = this.oldColumns
    this.node.width = this.oldWidth
    // Restore removed cells
    for (const { rowIndex, cell } of this.removedCells) {
      topology.rows[rowIndex]!.cells.splice(this.colIndex, 0, cell)
    }
    // Restore colSpan
    for (const m of this.affectedMerges) {
      const cell = topology.rows[m.rowIndex]!.cells[m.cellIndex]!
      cell.colSpan = m.oldColSpan
    }
  }
}

/** Resize a column by changing its ratio. Supports merge for continuous drag. */
export class ResizeTableColumnCommand implements Command {
  readonly id = generateId('cmd')
  readonly type = 'resize-table-column'
  readonly description = 'Resize table column'
  private oldRatio = 0
  private oldWidth = 0

  constructor(
    private node: TableNode,
    private colIndex: number,
    private newRatio: number,
    private newElementWidth: number,
  ) {}

  execute(): void {
    const col = this.node.table.topology.columns[this.colIndex]!
    this.oldRatio = col.ratio
    this.oldWidth = this.node.width
    col.ratio = this.newRatio
    this.node.width = this.newElementWidth
  }

  undo(): void {
    const col = this.node.table.topology.columns[this.colIndex]!
    col.ratio = this.oldRatio
    this.node.width = this.oldWidth
  }

  merge(next: Command): Command | null {
    if (next.type !== this.type)
      return null
    const other = next as ResizeTableColumnCommand
    if (other.node !== this.node || other.colIndex !== this.colIndex)
      return null
    const merged = new ResizeTableColumnCommand(this.node, this.colIndex, other.newRatio, other.newElementWidth)
    merged.oldRatio = this.oldRatio
    merged.oldWidth = this.oldWidth
    return merged
  }
}

/** Resize a row height. Supports merge for continuous drag. */
export class ResizeTableRowCommand implements Command {
  readonly id = generateId('cmd')
  readonly type = 'resize-table-row'
  readonly description = 'Resize table row'
  private oldRowHeight = 0
  private oldElementHeight = 0

  constructor(
    private node: TableNode,
    private rowIndex: number,
    private newHeight: number,
  ) {}

  execute(): void {
    const row = this.node.table.topology.rows[this.rowIndex]!
    this.oldRowHeight = row.height
    this.oldElementHeight = this.node.height
    const delta = this.newHeight - row.height
    row.height = this.newHeight
    this.node.height += delta
  }

  undo(): void {
    const row = this.node.table.topology.rows[this.rowIndex]!
    row.height = this.oldRowHeight
    this.node.height = this.oldElementHeight
  }

  merge(next: Command): Command | null {
    if (next.type !== this.type)
      return null
    const other = next as ResizeTableRowCommand
    if (other.node !== this.node || other.rowIndex !== this.rowIndex)
      return null
    const merged = new ResizeTableRowCommand(this.node, this.rowIndex, other.newHeight)
    merged.oldRowHeight = this.oldRowHeight
    merged.oldElementHeight = this.oldElementHeight
    return merged
  }
}

/** Update a table cell's properties. */
export class UpdateTableCellCommand implements Command {
  readonly id = generateId('cmd')
  readonly type = 'update-table-cell'
  readonly description = 'Update table cell'
  private oldValues: Partial<TableCellSchema> = {}

  constructor(
    private node: TableNode,
    private rowIndex: number,
    private cellIndex: number,
    private updates: Partial<TableCellSchema>,
  ) {}

  execute(): void {
    const cell = this.node.table.topology.rows[this.rowIndex]!.cells[this.cellIndex]!
    for (const key of Object.keys(this.updates) as Array<keyof TableCellSchema>) {
      asRecord(this.oldValues)[key] = deepClone(asRecord(cell)[key])
      asRecord(cell)[key] = deepClone(asRecord(this.updates)[key])
    }
  }

  undo(): void {
    const cell = this.node.table.topology.rows[this.rowIndex]!.cells[this.cellIndex]!
    for (const key of Object.keys(this.oldValues) as Array<keyof TableCellSchema>) {
      asRecord(cell)[key] = asRecord(this.oldValues)[key]
    }
  }
}

/** Update a row's role (only for table-data). */
export class UpdateTableRowRoleCommand implements Command {
  readonly id = generateId('cmd')
  readonly type = 'update-table-row-role'
  readonly description = 'Update row role'
  private oldRole: TableRowRole = 'normal'
  private rejected = false

  constructor(
    private node: TableNode,
    private rowIndex: number,
    private newRole: TableRowRole,
  ) {}

  execute(): void {
    const row = this.node.table.topology.rows[this.rowIndex]!
    this.oldRole = row.role
    // Reject if changing to header/footer would violate single-row constraint
    if (isTableDataNode(this.node) && (this.newRole === 'header' || this.newRole === 'footer')) {
      if (countRowsWithRole(this.node, this.newRole) >= 1) {
        this.rejected = true
        return
      }
    }
    row.role = this.newRole
  }

  undo(): void {
    if (this.rejected)
      return
    const row = this.node.table.topology.rows[this.rowIndex]!
    row.role = this.oldRole
  }
}

/** Update a single border side of a cell. */
export class UpdateTableCellBorderCommand implements Command {
  readonly id = generateId('cmd')
  readonly type = 'update-table-cell-border'
  readonly description = 'Update cell border'
  private oldBorder: TableCellSchema['border']

  constructor(
    private node: TableNode,
    private rowIndex: number,
    private cellIndex: number,
    private side: 'top' | 'right' | 'bottom' | 'left',
    private border: { width?: number, color?: string, type?: string } | undefined,
  ) {}

  execute(): void {
    const cell = this.node.table.topology.rows[this.rowIndex]!.cells[this.cellIndex]!
    this.oldBorder = deepClone(cell.border)
    if (!cell.border)
      cell.border = {}
    asRecord(cell.border)[this.side] = this.border ? deepClone(this.border) : undefined
  }

  undo(): void {
    const cell = this.node.table.topology.rows[this.rowIndex]!.cells[this.cellIndex]!
    cell.border = this.oldBorder
  }
}

/** Merge cells starting from (rowIndex, cellIndex) with given colSpan/rowSpan. */
export class MergeTableCellsCommand implements Command {
  readonly id = generateId('cmd')
  readonly type = 'merge-table-cells'
  readonly description = 'Merge cells'
  private oldSpans: Array<{ rowIndex: number, cellIndex: number, colSpan?: number, rowSpan?: number }> = []
  private rejected = false

  constructor(
    private node: TableNode,
    private rowIndex: number,
    private cellIndex: number,
    private colSpan: number,
    private rowSpan: number,
  ) {}

  execute(): void {
    // Dual-layer protection: command validates before executing
    if (!validateMerge(this.node, this.rowIndex, this.cellIndex, this.rowSpan, this.colSpan)) {
      this.rejected = true
      return
    }

    const { rows } = this.node.table.topology
    this.oldSpans = []

    // Save old spans and clear them
    for (let r = this.rowIndex; r < this.rowIndex + this.rowSpan && r < rows.length; r++) {
      const row = rows[r]!
      for (let c = this.cellIndex; c < this.cellIndex + this.colSpan && c < row.cells.length; c++) {
        const cell = row.cells[c]!
        this.oldSpans.push({ rowIndex: r, cellIndex: c, colSpan: cell.colSpan, rowSpan: cell.rowSpan })
      }
    }

    // Set the anchor cell's span
    const anchor = rows[this.rowIndex]!.cells[this.cellIndex]!
    anchor.colSpan = this.colSpan > 1 ? this.colSpan : undefined
    anchor.rowSpan = this.rowSpan > 1 ? this.rowSpan : undefined
  }

  undo(): void {
    if (this.rejected)
      return
    const { rows } = this.node.table.topology
    for (const { rowIndex, cellIndex, colSpan, rowSpan } of this.oldSpans) {
      const cell = rows[rowIndex]!.cells[cellIndex]!
      cell.colSpan = colSpan
      cell.rowSpan = rowSpan
    }
  }
}

/** Split a previously merged cell back to individual cells. */
export class SplitTableCellCommand implements Command {
  readonly id = generateId('cmd')
  readonly type = 'split-table-cell'
  readonly description = 'Split cell'
  private oldColSpan?: number
  private oldRowSpan?: number

  constructor(
    private node: TableNode,
    private rowIndex: number,
    private cellIndex: number,
  ) {}

  execute(): void {
    const cell = this.node.table.topology.rows[this.rowIndex]!.cells[this.cellIndex]!
    this.oldColSpan = cell.colSpan
    this.oldRowSpan = cell.rowSpan
    cell.colSpan = undefined
    cell.rowSpan = undefined
  }

  undo(): void {
    const cell = this.node.table.topology.rows[this.rowIndex]!.cells[this.cellIndex]!
    cell.colSpan = this.oldColSpan
    cell.rowSpan = this.oldRowSpan
  }
}

/** Bind a data source field to a table-static cell's staticBinding. */
export class BindStaticCellCommand implements Command {
  readonly id = generateId('cmd')
  readonly type = 'bind-static-cell'
  readonly description = 'Bind static cell'
  private oldBinding: BindingRef | undefined
  private oldContent: TableCellSchema['content']

  constructor(
    private node: TableNode,
    private rowIndex: number,
    private cellIndex: number,
    private binding: BindingRef,
  ) {}

  execute(): void {
    const cell = this.node.table.topology.rows[this.rowIndex]!.cells[this.cellIndex]!
    this.oldBinding = cell.staticBinding ? deepClone(cell.staticBinding) : undefined
    this.oldContent = cell.content ? deepClone(cell.content) : undefined
    cell.staticBinding = deepClone(this.binding)
    // Clear manual content when binding (mutual exclusion)
    cell.content = undefined
  }

  undo(): void {
    const cell = this.node.table.topology.rows[this.rowIndex]!.cells[this.cellIndex]!
    cell.staticBinding = this.oldBinding
    cell.content = this.oldContent
  }
}

/** Clear a table-static cell's staticBinding. */
export class ClearStaticCellBindingCommand implements Command {
  readonly id = generateId('cmd')
  readonly type = 'clear-static-cell-binding'
  readonly description = 'Clear static cell binding'
  private oldBinding: BindingRef | undefined

  constructor(
    private node: TableNode,
    private rowIndex: number,
    private cellIndex: number,
  ) {}

  execute(): void {
    const cell = this.node.table.topology.rows[this.rowIndex]!.cells[this.cellIndex]!
    this.oldBinding = cell.staticBinding ? deepClone(cell.staticBinding) : undefined
    cell.staticBinding = undefined
  }

  undo(): void {
    const cell = this.node.table.topology.rows[this.rowIndex]!.cells[this.cellIndex]!
    cell.staticBinding = this.oldBinding
  }
}

/** Toggle showHeader / showFooter on a table-data node. */
export class UpdateTableVisibilityCommand implements Command {
  readonly id = generateId('cmd')
  readonly type = 'update-table-visibility'
  readonly description = 'Update table visibility'
  private oldValue: boolean | undefined

  constructor(
    private node: TableNode,
    private field: 'showHeader' | 'showFooter',
    private newValue: boolean,
  ) {}

  execute(): void {
    const table = this.node.table as TableDataSchema
    this.oldValue = table[this.field]
    table[this.field] = this.newValue
  }

  undo(): void {
    const table = this.node.table as TableDataSchema
    table[this.field] = this.oldValue
  }
}
