import type {
  BackgroundRepeat,
  BlankPolicy,
  BorderAppearance,
  BorderType,
  PageMode,
  PageScale,
  PrintBehavior,
  TableRowRole,
  UnitType,
  UsageRule,
} from '@easyink/shared'

// ─── Document Schema ───────────────────────────────────────────────

export interface DocumentSchema {
  version: string
  meta?: DocumentMeta
  unit: UnitType
  page: PageSchema
  guides: GuideSchema
  elements: MaterialNode[]
  extensions?: Record<string, unknown>
  compat?: BenchmarkCompatState
}

export interface DocumentMeta {
  name?: string
  description?: string
  author?: string
  createdAt?: string
  updatedAt?: string
}

// ─── Guide Schema ──────────────────────────────────────────────────

export interface GuideSchema {
  x: number[]
  y: number[]
  groups?: GuideGroupSchema[]
}

export interface GuideGroupSchema {
  id: string
  x: number[]
  y: number[]
}

// ─── Compat State ──────────────────────────────────────────────────

export interface BenchmarkCompatState {
  rawGuideGroupKey?: string
  passthrough?: Record<string, unknown>
}

// ─── Page Schema ───────────────────────────────────────────────────

export interface PageSchema {
  mode: PageMode
  width: number
  height: number
  pages?: number
  scale?: PageScale
  radius?: string
  offsetX?: number
  offsetY?: number
  copies?: number
  blankPolicy?: BlankPolicy
  label?: LabelPageConfig
  grid?: GridConfig
  font?: string
  background?: PageBackground
  print?: PagePrintConfig
  extensions?: Record<string, unknown>
}

export interface LabelPageConfig {
  columns: number
  gap: number
}

export interface GridConfig {
  enabled: boolean
  width: number
  height: number
}

export interface PageBackground {
  color?: string
  image?: string
  repeat?: BackgroundRepeat
  width?: number
  height?: number
  offsetX?: number
  offsetY?: number
}

export interface PagePrintConfig {
  horizontalOffset?: number
  verticalOffset?: number
}

// ─── Material Node ─────────────────────────────────────────────────

export interface MaterialNode {
  id: string
  type: string
  name?: string
  unit?: UnitType
  x: number
  y: number
  width: number
  height: number
  rotation?: number
  alpha?: number
  zIndex?: number
  hidden?: boolean
  locked?: boolean
  print?: PrintBehavior
  props: Record<string, unknown>
  binding?: BindingRef | BindingRef[]
  animations?: AnimationSchema[]
  children?: MaterialNode[]
  diagnostics?: NodeDiagnosticState[]
  extensions?: Record<string, unknown>
  compat?: BenchmarkElementCompatState
}

export interface BenchmarkElementCompatState {
  rawProps?: Record<string, unknown>
  rawBind?: unknown
  passthrough?: Record<string, unknown>
}

// ─── Binding ───────────────────────────────────────────────────────

export interface BindingRef {
  sourceId: string
  sourceName?: string
  sourceTag?: string
  fieldPath: string
  fieldKey?: string
  fieldLabel?: string
  usage?: UsageRule
  bindIndex?: number
  union?: UnionBinding[]
  required?: boolean
  extensions?: Record<string, unknown>
}

export interface UnionBinding {
  sourceId?: string
  sourceTag?: string
  fieldPath: string
  fieldKey?: string
  fieldLabel?: string
  use?: string
  offsetX?: number
  offsetY?: number
  defaultProps?: Record<string, unknown>
}

// ─── Animation ─────────────────────────────────────────────────────

export interface AnimationSchema {
  trigger: string
  type: string
  duration?: number
  delay?: number
  options?: Record<string, unknown>
}

// ─── Diagnostics ───────────────────────────────────────────────────

export interface NodeDiagnosticState {
  code: string
  severity: 'error' | 'warning' | 'info'
  message: string
}

// ─── Table Schema ──────────────────────────────────────────────────

export interface TableNode extends MaterialNode {
  type: 'table-static' | 'table-data'
  table: TableSchema
}

export interface TableSchema {
  kind: 'static' | 'data'
  topology: TableTopologySchema
  layout: TableLayoutConfig
  diagnostics?: LayoutDiagnostic[]
}

/** table-data specific schema, adds primary datasource binding. */
export interface TableDataSchema extends TableSchema {
  kind: 'data'
  source?: BindingRef
  /** Header visibility. false = viewer skips header, pagination no repeat. Default true */
  showHeader?: boolean
  /** Footer visibility. false = viewer skips footer. Default true */
  showFooter?: boolean
}

export interface TableTopologySchema {
  /**
   * Normalized column ratios (0-1), sum must equal 1.
   * Actual pixel width = element.width * ratio.
   */
  columns: TableColumnSchema[]
  rows: TableRowSchema[]
}

export interface TableColumnSchema {
  /**
   * Normalized ratio (0-1). All column ratios sum to 1.
   * Actual width = element.width * ratio.
   * Resizing the table element scales all columns proportionally.
   */
  ratio: number
}

export interface TableLayoutConfig {
  equalizeCells?: boolean
  gap?: number
  borderAppearance?: BorderAppearance
  borderWidth?: number
  borderType?: BorderType
  borderColor?: string
  fillBlankRows?: boolean
}

export interface TableRowSchema {
  /**
   * Row height in absolute document units (not ratio).
   * repeat-template rows change dynamically at runtime,
   * making ratio-based row height semantically unsound.
   */
  height: number
  role: TableRowRole
  cells: TableCellSchema[]
}

/** Single-cell typography overrides. Missing fields fall back to table-level defaults. */
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

/** Table-level typography defaults. Symmetric to CellTypography but all fields required. */
export interface TableTypography {
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
  /**
   * Cell width is derived from columns[].ratio, not stored per-cell.
   * Merged cell width = sum of spanned column ratios * element.width.
   */
  border?: CellBorderSchema
  padding?: BoxSpacing
  content?: TableCellContentSlot
  typography?: CellTypography
  props?: Record<string, unknown>
  /** table-data: cell binding (relative path within table source) */
  binding?: BindingRef
  /** table-static: independent per-cell binding (each cell can bind different sourceId) */
  staticBinding?: BindingRef
}

export interface TableCellContentSlot {
  /**
   * v1: pure text only. Architecture reserves MaterialNode[] for future nested materials.
   */
  text?: string
  elements?: MaterialNode[]
  editMode?: 'inline-text' | 'rich-text' | 'hosted'
}

export interface CellBorderSchema {
  top?: BorderSide
  right?: BorderSide
  bottom?: BorderSide
  left?: BorderSide
}

export interface BorderSide {
  width?: number
  color?: string
  type?: BorderType
}

export interface BoxSpacing {
  top?: number
  right?: number
  bottom?: number
  left?: number
}

export interface LayoutDiagnostic {
  code: string
  severity: 'error' | 'warning' | 'info'
  message: string
  location?: { pageIndex?: number, rowIndex?: number }
}

// ─── Type Guards ──────────────────────────────────────────────────

/** Runtime discriminator for TableNode. Checks that node.type is a table type and node.table exists. */
export function isTableNode(node: MaterialNode): node is TableNode {
  return (node.type === 'table-static' || node.type === 'table-data')
    && 'table' in node
    && node.table != null
}

/** Narrow to TableNode with TableDataSchema (kind='data', has source). */
export function isTableDataNode(node: MaterialNode): node is TableNode & { table: TableDataSchema } {
  return isTableNode(node) && node.type === 'table-data' && node.table.kind === 'data'
}
