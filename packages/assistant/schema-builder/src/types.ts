export interface SchemaBuilderContext {
  pageMode: 'fixed' | 'continuous'
  pageWidth: number
  pageHeight: number
  unit: 'mm' | 'pt' | 'px'
  dataSourceName: string
}

export interface EmitElementInput {
  id: string
  type: string
  region: { x: number, y: number, width: number, height: number }
  props?: Record<string, unknown>
  binding?: EmitBindingInput
  children?: EmitElementInput[]
}

export interface EmitBindingInput {
  fieldPath: string
  fieldLabel?: string
  format?: Record<string, unknown>
}

export interface EmitTableDataInput {
  id: string
  region: { x: number, y: number, width: number, height: number }
  columns: TableColumnInput[]
  style?: TableStyleInput
  headerRow?: boolean
}

export interface TableColumnInput {
  label: string
  field: string
  ratio: number
  align?: 'left' | 'center' | 'right'
  verticalAlign?: 'top' | 'middle' | 'bottom'
}

export interface TableStyleInput {
  fontSize?: number
  headerBg?: string
  borderWidth?: number
  borderColor?: string
  cellPadding?: number
  stripedRows?: boolean
  stripedColor?: string
}

export interface EmitTableStaticInput {
  id: string
  region: { x: number, y: number, width: number, height: number }
  rows: TableStaticRowInput[]
  style?: TableStyleInput
}

export interface TableStaticRowInput {
  cells: TableStaticCellInput[]
  height?: number
}

export interface TableStaticCellInput {
  text?: string
  binding?: EmitBindingInput
  colSpan?: number
  rowSpan?: number
  align?: 'left' | 'center' | 'right'
  bold?: boolean
  bg?: string
}
