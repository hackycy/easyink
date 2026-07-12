import type { BindingRef, MaterialNode } from '@easyink/schema'
import type { BorderAppearance, BorderType, TableRowRole } from '@easyink/shared'

export interface TableTopologySchema {
  columns: TableColumnSchema[]
  rows: TableRowSchema[]
}

export interface TableColumnSchema {
  ratio: number
}

export interface TableLayoutConfig {
  gap?: number
  borderAppearance?: BorderAppearance
  borderWidth?: number
  borderType?: BorderType
  borderColor?: string
  fillBlankRows?: boolean
}

export interface TableRowSchema {
  height: number
  role: TableRowRole
  cells: TableCellSchema[]
}

export interface CellTypography {
  fontSize?: number
  color?: string
  fontWeight?: 'normal' | 'bold'
  fontStyle?: 'normal' | 'italic'
  lineHeight?: number
  letterSpacing?: number
  textAlign?: 'left' | 'center' | 'right'
  verticalAlign?: 'top' | 'middle' | 'bottom'
}

export interface ProjectedTableTypography {
  fontFamily?: string
  fontSize: number
  color: string
  fontWeight: 'normal' | 'bold'
  fontStyle: 'normal' | 'italic'
  lineHeight: number
  letterSpacing: number
  textAlign: 'left' | 'center' | 'right'
  verticalAlign: 'top' | 'middle' | 'bottom'
}

export interface TableCellSchema {
  rowSpan?: number
  colSpan?: number
  border?: CellBorderSchema
  padding?: BoxSpacing
  content?: TableCellContentSlot
  typography?: CellTypography
  props?: Record<string, unknown>
  binding?: BindingRef
  staticBinding?: BindingRef
}

export interface TableCellContentSlot {
  text?: string
  elements?: MaterialNode[]
  editMode?: 'inline-text' | 'rich-text' | 'hosted'
}

export interface CellBorderSchema {
  top?: boolean
  right?: boolean
  bottom?: boolean
  left?: boolean
}

export interface BoxSpacing {
  top?: number
  right?: number
  bottom?: number
  left?: number
}
