import type { CellTypography, TableCellSchema, TableTypography } from '@easyink/schema'

/**
 * Resolve a cell's effective typography by merging cell-level overrides
 * onto table-level defaults. Missing cell fields fall back to table defaults.
 */
export function resolveCellTypography(
  cell: TableCellSchema,
  tableTypography: TableTypography,
): Required<CellTypography> {
  return {
    fontSize: cell.typography?.fontSize ?? tableTypography.fontSize,
    color: cell.typography?.color ?? tableTypography.color,
    fontWeight: cell.typography?.fontWeight ?? tableTypography.fontWeight,
    fontStyle: cell.typography?.fontStyle ?? tableTypography.fontStyle,
    lineHeight: cell.typography?.lineHeight ?? tableTypography.lineHeight,
    letterSpacing: cell.typography?.letterSpacing ?? tableTypography.letterSpacing,
    textAlign: cell.typography?.textAlign ?? tableTypography.textAlign,
    verticalAlign: cell.typography?.verticalAlign ?? tableTypography.verticalAlign,
  }
}
