import type { Command } from '@easyink/core'
import type { TableDataSchema, TableNode } from '@easyink/schema'
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

/**
 * Toggle showHeader / showFooter on a table-data node.
 *
 * Side effect: adjusts `node.height` so visible rows preserve their current
 * scaled (rendered) height. Algorithm:
 * - Let S = sum of row.height across rows currently visible (incl. soon-toggled).
 * - Let scale = node.height / S (the rendering scale before the toggle).
 * - Let T = sum of row.height for rows of the toggled role.
 * - Hiding (was visible → hidden): node.height -= T * scale.
 * - Showing (was hidden → visible): node.height += T * scale, where S now
 *   excludes the soon-shown rows (so scale reflects "current visible only").
 *
 * Reversal yields the original height (within fp tolerance), so reopen-after-
 * close does not drift. Empty visible-row case is impossible for table-data
 * because repeat-template is always present.
 */
export class UpdateTableVisibilityCommand implements Command {
  readonly id = generateId('cmd')
  readonly type = 'update-table-visibility'
  readonly description = 'Update table visibility'
  private oldValue: boolean | undefined
  private oldHeight = 0

  constructor(
    private node: TableNode,
    private field: 'showHeader' | 'showFooter',
    private newValue: boolean,
  ) {}

  execute(): void {
    const table = this.node.table as TableDataSchema
    const rows = this.node.table.topology.rows

    this.oldValue = table[this.field]
    this.oldHeight = this.node.height

    const wasVisible = this.oldValue !== false
    const willBeVisible = this.newValue
    if (wasVisible === willBeVisible) {
      table[this.field] = this.newValue
      return
    }

    const targetRole = this.field === 'showHeader' ? 'header' : 'footer'
    const otherRole = this.field === 'showHeader' ? 'footer' : 'header'
    const otherField = this.field === 'showHeader' ? 'showFooter' : 'showHeader'
    const otherVisible = table[otherField] !== false

    // Sum of schema heights for rows currently visible (using *current* visibility).
    let visibleSum = 0
    let toggledSum = 0
    for (const r of rows) {
      if (r.role === targetRole) {
        toggledSum += r.height
        if (wasVisible)
          visibleSum += r.height
      }
      else if (r.role === otherRole) {
        if (otherVisible)
          visibleSum += r.height
      }
      else {
        visibleSum += r.height
      }
    }

    const scale = visibleSum > 0 ? this.node.height / visibleSum : 1
    const delta = toggledSum * scale

    table[this.field] = this.newValue
    this.node.height = wasVisible
      ? Math.max(0, this.node.height - delta)
      : this.node.height + delta
  }

  undo(): void {
    const table = this.node.table as TableDataSchema
    table[this.field] = this.oldValue
    this.node.height = this.oldHeight
  }
}
