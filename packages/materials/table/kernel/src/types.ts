import type { MaterialNode, TableTypography } from '@easyink/schema'
import { getTableMaterialModel } from './model'

/**
 * Shared table base props -- the property fields common to all table types.
 * table-static uses this as-is; table-data extends it with additional fields.
 */
export interface TableBaseProps {
  borderWidth: number
  borderColor: string
  borderType: 'solid' | 'dashed' | 'dotted'
  cellPadding: number
  typography: TableTypography
}

export const TABLE_TYPOGRAPHY_DEFAULTS: TableTypography = {
  fontFamily: '',
  fontSize: 3.18,
  color: '#000000',
  fontWeight: 'normal',
  fontStyle: 'normal',
  lineHeight: 1.2,
  letterSpacing: 0,
  textAlign: 'left',
  verticalAlign: 'middle',
}

export const TABLE_BASE_DEFAULTS: TableBaseProps = {
  borderWidth: 0.26,
  borderColor: '#000000',
  borderType: 'solid',
  cellPadding: 0.53,
  typography: { ...TABLE_TYPOGRAPHY_DEFAULTS },
}

export function resolveTableBaseProps(node: MaterialNode<unknown>): TableBaseProps {
  const style = getTableMaterialModel(node).style
  const border = style.border?.blockStart
  const typography = style.typography
  return {
    borderWidth: border?.width ?? TABLE_BASE_DEFAULTS.borderWidth,
    borderColor: border?.color ?? TABLE_BASE_DEFAULTS.borderColor,
    borderType: border?.style === 'dashed' || border?.style === 'dotted' ? border.style : 'solid',
    cellPadding: style.padding?.top ?? TABLE_BASE_DEFAULTS.cellPadding,
    typography: {
      ...TABLE_TYPOGRAPHY_DEFAULTS,
      ...typography,
      textAlign: typography?.textAlign === 'start' ? 'left' : typography?.textAlign === 'end' ? 'right' : typography?.textAlign ?? TABLE_TYPOGRAPHY_DEFAULTS.textAlign,
    },
  }
}

/**
 * Shared capability flags for all table types.
 * Each table material spreads this and overrides `bindable` / `multiBinding`.
 */
export const TABLE_BASE_CAPABILITIES = {
  rotatable: false,
  resizable: true,
  supportsChildren: false,
  supportsAnimation: false,
  supportsUnionDrop: false,
} as const

/** Rectangle result from geometry calculations. */
export interface CellRect {
  x: number
  y: number
  w: number
  h: number
}
