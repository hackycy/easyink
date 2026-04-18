import type { TableDataSchema, TableNode } from '@easyink/schema'
import type { Command } from '../command'
import { isTableDataNode } from '@easyink/schema'
import { generateId } from '@easyink/shared'

// ─── Validation Utilities ───────────────────────────────────────────

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

// ─── Table Visibility Command ──────────────────────────────────────

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
