import type { BindingRef, DocumentSchema, GuideSchema, MaterialNode, PageSchema, TableBandSchema, TableCellSchema, TableNode, TableRowSchema } from '@easyink/schema'
import type { UsageRule } from '@easyink/shared'
import type { Command } from './command'
import { isTableNode } from '@easyink/schema'
import { deepClone, generateId } from '@easyink/shared'

function findNode(elements: MaterialNode[], id: string): MaterialNode | undefined {
  return elements.find(el => el.id === id)
}

function asRecord(obj: unknown): Record<string, unknown> {
  return obj as Record<string, unknown>
}

// ─── Document Commands ──────────────────────────────────────────────

export class AddMaterialCommand implements Command {
  readonly id = generateId('cmd')
  readonly type = 'add-material'
  readonly description = 'Add material'

  constructor(
    private elements: MaterialNode[],
    private node: MaterialNode,
  ) {}

  execute(): void {
    this.elements.push(this.node)
  }

  undo(): void {
    const idx = this.elements.findIndex(el => el.id === this.node.id)
    if (idx >= 0)
      this.elements.splice(idx, 1)
  }
}

export class RemoveMaterialCommand implements Command {
  readonly id = generateId('cmd')
  readonly type = 'remove-material'
  readonly description = 'Remove material'
  private snapshot: MaterialNode | undefined
  private index = -1

  constructor(
    private elements: MaterialNode[],
    private nodeId: string,
  ) {}

  execute(): void {
    const idx = this.elements.findIndex(el => el.id === this.nodeId)
    if (idx < 0)
      return
    this.index = idx
    this.snapshot = deepClone(this.elements[idx]!)
    this.elements.splice(idx, 1)
  }

  undo(): void {
    if (this.snapshot)
      this.elements.splice(this.index, 0, this.snapshot)
  }
}

export class MoveMaterialCommand implements Command {
  readonly id = generateId('cmd')
  readonly type = 'move-material'
  readonly description = 'Move material'
  private oldX = 0
  private oldY = 0

  constructor(
    private elements: MaterialNode[],
    private nodeId: string,
    private to: { x: number, y: number },
  ) {}

  execute(): void {
    const node = findNode(this.elements, this.nodeId)
    if (!node)
      return
    this.oldX = node.x
    this.oldY = node.y
    node.x = this.to.x
    node.y = this.to.y
  }

  undo(): void {
    const node = findNode(this.elements, this.nodeId)
    if (!node)
      return
    node.x = this.oldX
    node.y = this.oldY
  }

  merge(next: Command): Command | null {
    if (next.type !== this.type)
      return null
    const other = next as MoveMaterialCommand
    if (other.nodeId !== this.nodeId)
      return null
    const merged = new MoveMaterialCommand(this.elements, this.nodeId, other.to)
    merged.oldX = this.oldX
    merged.oldY = this.oldY
    return merged
  }
}

export class ResizeMaterialCommand implements Command {
  readonly id = generateId('cmd')
  readonly type = 'resize-material'
  readonly description = 'Resize material'
  private oldX = 0
  private oldY = 0
  private oldWidth = 0
  private oldHeight = 0
  private oldRowHeights: number[] | null = null

  constructor(
    private elements: MaterialNode[],
    private nodeId: string,
    private to: { x: number, y: number, width: number, height: number },
    private rowHeights: number[] | null = null,
  ) {}

  execute(): void {
    const node = findNode(this.elements, this.nodeId)
    if (!node)
      return
    this.oldX = node.x
    this.oldY = node.y
    this.oldWidth = node.width
    this.oldHeight = node.height
    node.x = this.to.x
    node.y = this.to.y
    node.width = this.to.width
    node.height = this.to.height

    // Scale table row heights when provided
    if (this.rowHeights && isTableNode(node)) {
      const rows = node.table.topology.rows
      this.oldRowHeights = rows.map(r => r.height)
      for (let i = 0; i < rows.length && i < this.rowHeights.length; i++) {
        rows[i]!.height = this.rowHeights[i]!
      }
    }
  }

  undo(): void {
    const node = findNode(this.elements, this.nodeId)
    if (!node)
      return
    node.x = this.oldX
    node.y = this.oldY
    node.width = this.oldWidth
    node.height = this.oldHeight

    if (this.oldRowHeights && isTableNode(node)) {
      const rows = node.table.topology.rows
      for (let i = 0; i < rows.length && i < this.oldRowHeights.length; i++) {
        rows[i]!.height = this.oldRowHeights[i]!
      }
    }
  }

  merge(next: Command): Command | null {
    if (next.type !== this.type)
      return null
    const other = next as ResizeMaterialCommand
    if (other.nodeId !== this.nodeId)
      return null
    const merged = new ResizeMaterialCommand(this.elements, this.nodeId, other.to, other.rowHeights)
    merged.oldX = this.oldX
    merged.oldY = this.oldY
    merged.oldWidth = this.oldWidth
    merged.oldHeight = this.oldHeight
    merged.oldRowHeights = this.oldRowHeights
    return merged
  }
}

export class RotateMaterialCommand implements Command {
  readonly id = generateId('cmd')
  readonly type = 'rotate-material'
  readonly description = 'Rotate material'
  private oldRotation = 0

  constructor(
    private elements: MaterialNode[],
    private nodeId: string,
    private to: number,
  ) {}

  execute(): void {
    const node = findNode(this.elements, this.nodeId)
    if (!node)
      return
    this.oldRotation = node.rotation ?? 0
    node.rotation = this.to
  }

  undo(): void {
    const node = findNode(this.elements, this.nodeId)
    if (!node)
      return
    node.rotation = this.oldRotation
  }

  merge(next: Command): Command | null {
    if (next.type !== this.type)
      return null
    const other = next as RotateMaterialCommand
    if (other.nodeId !== this.nodeId)
      return null
    const merged = new RotateMaterialCommand(this.elements, this.nodeId, other.to)
    merged.oldRotation = this.oldRotation
    return merged
  }
}

export class UpdateMaterialPropsCommand implements Command {
  readonly id = generateId('cmd')
  readonly type = 'update-material-props'
  readonly description = 'Update material props'
  private oldValues: Record<string, unknown> = {}

  constructor(
    private elements: MaterialNode[],
    private nodeId: string,
    private updates: Record<string, unknown>,
  ) {}

  execute(): void {
    const node = findNode(this.elements, this.nodeId)
    if (!node)
      return
    for (const key of Object.keys(this.updates)) {
      this.oldValues[key] = deepClone(node.props[key])
      node.props[key] = deepClone(this.updates[key])
    }
  }

  undo(): void {
    const node = findNode(this.elements, this.nodeId)
    if (!node)
      return
    for (const key of Object.keys(this.oldValues)) {
      node.props[key] = this.oldValues[key]
    }
  }
}

export class UpdatePageCommand implements Command {
  readonly id = generateId('cmd')
  readonly type = 'update-page'
  readonly description = 'Update page'
  private oldValues: Partial<PageSchema> = {}

  constructor(
    private page: PageSchema,
    private updates: Partial<PageSchema>,
  ) {}

  execute(): void {
    for (const key of Object.keys(this.updates) as Array<keyof PageSchema>) {
      asRecord(this.oldValues)[key] = deepClone(asRecord(this.page)[key])
      asRecord(this.page)[key] = deepClone(asRecord(this.updates)[key])
    }
  }

  undo(): void {
    for (const key of Object.keys(this.oldValues) as Array<keyof PageSchema>) {
      asRecord(this.page)[key] = asRecord(this.oldValues)[key]
    }
  }
}

export class UpdateGuidesCommand implements Command {
  readonly id = generateId('cmd')
  readonly type = 'update-guides'
  readonly description = 'Update guides'
  private oldGuides: GuideSchema | undefined

  constructor(
    private schema: DocumentSchema,
    private newGuides: GuideSchema,
  ) {}

  execute(): void {
    this.oldGuides = deepClone(this.schema.guides)
    this.schema.guides = deepClone(this.newGuides)
  }

  undo(): void {
    if (this.oldGuides)
      this.schema.guides = this.oldGuides
  }
}

// ─── Data Commands ──────────────────────────────────────────────────

export class BindFieldCommand implements Command {
  readonly id = generateId('cmd')
  readonly type = 'bind-field'
  readonly description = 'Bind field'
  private oldBinding: BindingRef | BindingRef[] | undefined

  constructor(
    private elements: MaterialNode[],
    private nodeId: string,
    private binding: BindingRef,
  ) {}

  execute(): void {
    const node = findNode(this.elements, this.nodeId)
    if (!node)
      return
    this.oldBinding = deepClone(node.binding)
    node.binding = deepClone(this.binding)
  }

  undo(): void {
    const node = findNode(this.elements, this.nodeId)
    if (!node)
      return
    node.binding = this.oldBinding
  }
}

export class ClearBindingCommand implements Command {
  readonly id = generateId('cmd')
  readonly type = 'clear-binding'
  readonly description = 'Clear binding'
  private oldBinding: BindingRef | BindingRef[] | undefined

  constructor(
    private elements: MaterialNode[],
    private nodeId: string,
  ) {}

  execute(): void {
    const node = findNode(this.elements, this.nodeId)
    if (!node)
      return
    this.oldBinding = deepClone(node.binding)
    node.binding = undefined
  }

  undo(): void {
    const node = findNode(this.elements, this.nodeId)
    if (!node)
      return
    node.binding = this.oldBinding
  }
}

export class UpdateUsageCommand implements Command {
  readonly id = generateId('cmd')
  readonly type = 'update-usage'
  readonly description = 'Update usage'
  private oldUsage: UsageRule | undefined

  constructor(
    private elements: MaterialNode[],
    private nodeId: string,
    private bindIndex: number,
    private usage: UsageRule,
  ) {}

  execute(): void {
    const node = findNode(this.elements, this.nodeId)
    if (!node)
      return
    const ref = this.getRef(node)
    if (!ref)
      return
    this.oldUsage = deepClone(ref.usage)
    ref.usage = deepClone(this.usage)
  }

  undo(): void {
    const node = findNode(this.elements, this.nodeId)
    if (!node)
      return
    const ref = this.getRef(node)
    if (!ref)
      return
    ref.usage = this.oldUsage
  }

  private getRef(node: MaterialNode): BindingRef | undefined {
    if (Array.isArray(node.binding))
      return node.binding[this.bindIndex]
    if (this.bindIndex === 0)
      return node.binding
    return undefined
  }
}

export class UnionDropCommand implements Command {
  readonly id = generateId('cmd')
  readonly type = 'union-drop'
  readonly description = 'Union drop'
  private nodeIds: string[]

  constructor(
    private elements: MaterialNode[],
    private nodes: MaterialNode[],
  ) {
    this.nodeIds = nodes.map(n => n.id)
  }

  execute(): void {
    for (const node of this.nodes)
      this.elements.push(node)
  }

  undo(): void {
    const ids = new Set(this.nodeIds)
    for (let i = this.elements.length - 1; i >= 0; i--) {
      if (ids.has(this.elements[i]!.id))
        this.elements.splice(i, 1)
    }
  }
}

// ─── Table Commands ─────────────────────────────────────────────────

/** Insert a row into the table topology. Adjusts band rowRanges accordingly. */
export class InsertTableRowCommand implements Command {
  readonly id = generateId('cmd')
  readonly type = 'insert-table-row'
  readonly description = 'Insert table row'

  constructor(
    private node: TableNode,
    private rowIndex: number,
    private row: TableRowSchema,
  ) {}

  execute(): void {
    this.node.table.topology.rows.splice(this.rowIndex, 0, this.row)
    // Shift band rowRanges: bands starting at or after insertion get shifted
    for (const band of this.node.table.bands) {
      if (band.rowRange.start >= this.rowIndex)
        band.rowRange.start++
      if (band.rowRange.end >= this.rowIndex)
        band.rowRange.end++
    }
    // Update element height
    this.node.height += this.row.height
  }

  undo(): void {
    this.node.table.topology.rows.splice(this.rowIndex, 1)
    for (const band of this.node.table.bands) {
      if (band.rowRange.start > this.rowIndex)
        band.rowRange.start--
      if (band.rowRange.end > this.rowIndex)
        band.rowRange.end--
    }
    this.node.height -= this.row.height
  }
}

/** Remove a row from the table topology. Adjusts band rowRanges accordingly. */
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
    for (const band of this.node.table.bands) {
      if (band.rowRange.start > this.rowIndex)
        band.rowRange.start--
      if (band.rowRange.end > this.rowIndex)
        band.rowRange.end--
    }
  }

  undo(): void {
    if (!this.snapshot)
      return
    this.node.table.topology.rows.splice(this.rowIndex, 0, this.snapshot)
    for (const band of this.node.table.bands) {
      if (band.rowRange.start >= this.rowIndex)
        band.rowRange.start++
      if (band.rowRange.end >= this.rowIndex)
        band.rowRange.end++
    }
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

/** Update a band's properties (visibility, repeat, etc). */
export class UpdateTableBandCommand implements Command {
  readonly id = generateId('cmd')
  readonly type = 'update-table-band'
  readonly description = 'Update table band'
  private oldValues: Partial<TableBandSchema> = {}

  constructor(
    private node: TableNode,
    private bandIndex: number,
    private updates: Partial<TableBandSchema>,
  ) {}

  execute(): void {
    const band = this.node.table.bands[this.bandIndex]!
    for (const key of Object.keys(this.updates) as Array<keyof TableBandSchema>) {
      asRecord(this.oldValues)[key] = deepClone(asRecord(band)[key])
      asRecord(band)[key] = deepClone(asRecord(this.updates)[key])
    }
  }

  undo(): void {
    const band = this.node.table.bands[this.bandIndex]!
    for (const key of Object.keys(this.oldValues) as Array<keyof TableBandSchema>) {
      asRecord(band)[key] = asRecord(this.oldValues)[key]
    }
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

  constructor(
    private node: TableNode,
    private rowIndex: number,
    private cellIndex: number,
    private colSpan: number,
    private rowSpan: number,
  ) {}

  execute(): void {
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

export class UpdateDocumentCommand implements Command {
  readonly id = generateId('cmd')
  readonly type = 'update-document'
  readonly description = 'Update document'
  private oldValues: Partial<DocumentSchema> = {}

  constructor(
    private schema: DocumentSchema,
    private updates: Partial<Pick<DocumentSchema, 'unit' | 'meta' | 'extensions' | 'compat'>>,
  ) {}

  execute(): void {
    for (const key of Object.keys(this.updates) as Array<keyof typeof this.updates>) {
      asRecord(this.oldValues)[key] = deepClone(asRecord(this.schema)[key])
      asRecord(this.schema)[key] = deepClone(asRecord(this.updates)[key])
    }
  }

  undo(): void {
    for (const key of Object.keys(this.oldValues) as Array<keyof typeof this.oldValues>) {
      asRecord(this.schema)[key] = asRecord(this.oldValues)[key]
    }
  }
}

export class ImportTemplateCommand implements Command {
  readonly id = generateId('cmd')
  readonly type = 'import-template'
  readonly description = 'Import template'
  private oldElements: MaterialNode[] = []
  private oldPage: PageSchema | undefined
  private oldGuides: GuideSchema | undefined

  constructor(
    private schema: DocumentSchema,
    private imported: DocumentSchema,
  ) {}

  execute(): void {
    this.oldElements = deepClone(this.schema.elements)
    this.oldPage = deepClone(this.schema.page)
    this.oldGuides = deepClone(this.schema.guides)
    this.schema.elements.length = 0
    for (const el of this.imported.elements)
      this.schema.elements.push(deepClone(el))
    Object.assign(this.schema.page, deepClone(this.imported.page))
    this.schema.guides = deepClone(this.imported.guides)
  }

  undo(): void {
    this.schema.elements.length = 0
    for (const el of this.oldElements)
      this.schema.elements.push(el)
    if (this.oldPage)
      Object.assign(this.schema.page, this.oldPage)
    if (this.oldGuides)
      this.schema.guides = this.oldGuides
  }
}
