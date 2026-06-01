import type { TableLayoutConfig, TableRowSchema, TableTopologySchema } from '@easyink/schema'
import type { TableRowRole } from '@easyink/shared'

/**
 * Create a default table topology with equal column ratios and uniform row height.
 * @param cols - number of columns
 * @param rowCount - number of rows
 * @param rowHeight - height for each row
 * @param roles - role for each row; defaults to all 'normal'
 */
export function createDefaultTopology(cols: number, rowCount: number, rowHeight: number, roles?: TableRowRole[]): TableTopologySchema {
  const ratio = 1 / cols
  return {
    columns: Array.from({ length: cols }, () => ({ ratio })),
    rows: Array.from({ length: rowCount }, (_, i): TableRowSchema => ({
      height: rowHeight,
      role: roles?.[i] ?? 'normal',
      cells: Array.from({ length: cols }, () => ({})),
    })),
  }
}

/**
 * Create the default table layout config (all borders, 1px solid black).
 */
export function createDefaultLayout(): TableLayoutConfig {
  return {
    borderAppearance: 'all',
    borderWidth: 1,
    borderType: 'solid',
    borderColor: '#000000',
  }
}
