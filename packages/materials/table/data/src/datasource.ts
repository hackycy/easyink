import type { TableRowRole } from '@easyink/shared'

export interface TableDataBindingHint {
  rowRole: TableRowRole
  columnIndex: number
  /** Absolute field path (e.g. 'items/name', not relative 'name'). */
  fieldPath: string
}

/**
 * Create binding hints for a repeat-template row.
 * @param columns Absolute field paths (e.g. ['items/name', 'items/qty'])
 */
export function createBindingHints(columns: string[]): TableDataBindingHint[] {
  return columns.map((fieldPath, index) => ({
    rowRole: 'repeat-template',
    columnIndex: index,
    fieldPath,
  }))
}
