import type {
  BackgroundRepeat,
  BindingDisplayFormat,
  BlankPolicy,
  BorderAppearance,
  BorderType,
  LayoutStrategyKind,
  MaterialUseToken,
  PageMode,
  PageModelKind,
  PageScale,
  PaginationStrategyKind,
  PrintBehavior,
  ReflowStrategyKind,
  TableRowRole,
  UnitType,
} from '@easyink/shared'

export type PagePrintOrientation = 'auto' | 'portrait' | 'landscape'

// ─── Document Schema ───────────────────────────────────────────────

export interface DocumentSchema {
  version: string
  meta?: DocumentMeta
  unit: UnitType
  page: PageSchema
  guides: GuideSchema
  elements: MaterialNode[]
  groups?: ElementGroupSchema[]
  extensions?: DocumentSchemaExtensions
  compat?: BenchmarkCompatState
}

export type DocumentSchemaInput = Partial<Omit<DocumentSchema, 'version' | 'page' | 'guides' | 'elements' | 'groups'>> & {
  page?: Partial<PageSchema>
  guides?: Partial<GuideSchema>
  elements?: MaterialNode[]
  groups?: ElementGroupSchema[]
}

export interface DocumentMeta {
  name?: string
  description?: string
  author?: string
  createdAt?: string
  updatedAt?: string
}

/**
 * Serializable data source snapshot stored inside schema extensions.
 * Kept local to the schema package so contribution-driven persistence does
 * not invert package dependencies.
 */
export interface DataSourceSnapshot {
  id: string
  name: string
  tag?: string
  title?: string
  icon?: string
  expand?: boolean
  headless?: boolean
  fields: DataFieldSnapshot[]
  meta?: Record<string, unknown>
}

/**
 * Serializable field-tree node for persisted MCP data source snapshots.
 */
export interface DataFieldSnapshot {
  name: string
  key?: string
  path?: string
  title?: string
  id?: string
  tag?: string
  use?: MaterialUseToken
  props?: Record<string, unknown>
  format?: BindingDisplayFormat
  bindIndex?: number
  union?: DataUnionBindingSnapshot[]
  expand?: boolean
  fields?: DataFieldSnapshot[]
  meta?: Record<string, unknown>
}

/**
 * Serializable one-drag-multi-create binding snapshot.
 */
export interface DataUnionBindingSnapshot {
  name?: string
  key?: string
  path?: string
  title?: string
  id?: string
  tag?: string
  use?: string
  offsetX?: number
  offsetY?: number
  props?: Record<string, unknown>
  format?: BindingDisplayFormat
}

/**
 * Snapshot of a provider factory for serialization.
 */
export interface ProviderFactorySnapshot {
  id: string
  namespace: string
  meta?: Record<string, unknown>
}

/**
 * A saved version of a template.
 * `source` is an open string so contributions can label history origins.
 * Conventional values: 'user', 'template', 'ai'.
 */
export interface TemplateVersion {
  id: string
  schema: DocumentSchema
  prompt?: string
  source: string
  timestamp: number
  parentId?: string
  metadata?: Record<string, unknown>
}

/**
 * Expected data source structure for schema-first alignment.
 * Returned by getSchema tool, consumed by getDataSource tool.
 */
export interface ExpectedDataSource {
  /** Expected data source name */
  name: string
  /** Expected field structure with types */
  fields: ExpectedField[]
  /** Sample data for validation */
  sampleData?: Record<string, unknown>
}

/**
 * Expected field in the data source.
 */
export interface ExpectedField {
  name: string
  title?: string
  fieldLabel?: string
  type: 'string' | 'number' | 'boolean' | 'array' | 'object'
  required?: boolean
  path: string
  children?: ExpectedField[]
}

/**
 * Open extension namespace map. Contributions own their own top-level keys
 * (e.g. `ai`, `comments`) and store arbitrary serialisable values under them.
 */
export interface DocumentSchemaExtensions {
  [key: string]: unknown
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

// ─── Logical Element Groups ───────────────────────────────────────

export interface ElementGroupSchema {
  id: string
  memberIds: string[]
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
  grid?: GridConfig
  font?: string
  background?: PageBackground
  layers?: PageLayerConfig[]
  print?: PagePrintConfig
  pageModel?: PageModelConfig
  layout?: DocumentLayoutConfig
  pagination?: PaginationConfig
  reflow?: ReflowConfig
  extensions?: Record<string, unknown>
}

export interface PageModelConfig {
  kind: PageModelKind
  paper: {
    width: number
    height: number
    minHeight?: number
    maxHeight?: number
  }
}

export interface DocumentLayoutConfig {
  strategy: LayoutStrategyKind
  flowAxis?: 'y'
}

export interface PaginationConfig {
  strategy: PaginationStrategyKind
  pageCount?: number
  orphanPolicy?: 'allow' | 'keep-together'
}

export interface ReflowConfig {
  strategy: ReflowStrategyKind
  preserveTrailingGap?: boolean
  collisionPolicy?: 'diagnose' | 'clip' | 'push'
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

export type PageLayerPlacement = 'under-content' | 'over-content' | 'top'

export type PageLayerConfig = TextWatermarkPageLayerConfig

export interface PageLayerBaseConfig {
  id: string
  kind: string
  enabled?: boolean
  placement?: PageLayerPlacement
  zIndex?: number
}

export interface TextWatermarkPageLayerConfig extends PageLayerBaseConfig {
  kind: 'watermark'
  type: 'text'
  text?: string
  rotation?: number
  opacity?: number
  fontSize?: number
  gap?: number
  color?: string
}

export interface PagePrintConfig {
  orientation?: PagePrintOrientation
  horizontalOffset?: number
  verticalOffset?: number
}

// ─── Node Layout Behavior ───────────────────────────────────────────

export interface NodePlacementConfig {
  mode?: 'flow' | 'fixed'
}

export interface NodeBreakConfig {
  keepTogether?: boolean
  before?: 'auto' | 'page'
  after?: 'auto' | 'page'
}

export interface NodeRepeatConfig {
  scope?: 'none' | 'every-output-page'
}

// ─── Material Node ─────────────────────────────────────────────────

export type ConditionCompareOperator
  = | 'eq' | 'neq'
    | 'gt' | 'gte' | 'lt' | 'lte'
    | 'between' | 'notBetween'
    | 'in' | 'notIn'
    | 'contains' | 'notContains' | 'startsWith' | 'endsWith'
    | 'exists' | 'notExists' | 'isEmpty' | 'isNotEmpty'

export type ConditionValueType = 'string' | 'trimmed-string' | 'case-insensitive-string' | 'number' | 'boolean' | 'datetime'
export type ConditionQuantifier = 'any' | 'all' | 'none'

export interface ConditionOperator {
  compare: ConditionCompareOperator
  quantifier?: ConditionQuantifier
}

export interface ConditionFieldRef {
  path: string
  sourceId?: string
  sourceName?: string
  sourceTag?: string
  fieldKey?: string
  fieldLabel?: string
  fieldTag?: string
}

export type ConditionScalar = string | number | boolean | null

export interface ConditionValue {
  kind: 'literal'
  value: ConditionScalar
}

export interface ConditionRow {
  source: ConditionFieldRef
  operator: ConditionOperator
  valueType?: ConditionValueType
  value?: ConditionValue | ConditionValue[]
}

export interface ConditionGroup {
  conditions: ConditionRow[]
}

export interface RenderCondition {
  enabled?: boolean
  whenMatched: 'show' | 'hide'
  whenHidden?: 'remove' | 'reserve'
  onUnknown?: 'show' | 'hide'
  groups: ConditionGroup[]
}

export interface MaterialNode<TProps extends object = Record<string, unknown>> {
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
  renderCondition?: RenderCondition
  locked?: boolean
  print?: PrintBehavior
  placement?: NodePlacementConfig
  break?: NodeBreakConfig
  repeat?: NodeRepeatConfig
  props: TProps
  binding?: MaterialBinding
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
  format?: BindingDisplayFormat
  bindIndex?: number
  required?: boolean
  extensions?: Record<string, unknown>
}

export type MaterialBinding = BindingRef | BindingRef[] | DataContractBinding

export interface DataContractBinding {
  kind: 'data-contract'
  mappings: Record<string, DataContractFieldMapping>
  relation?: DataContractRelation
}

export interface DataContractFieldMapping {
  sourceId: string
  sourceName?: string
  sourceTag?: string
  select: DataContractFieldSelect
  format?: BindingDisplayFormat
  required?: boolean
  extensions?: Record<string, unknown>
}

export interface DataContractFieldSelect {
  path: string
  key?: string
  label?: string
  tag?: string
}

export type DataContractRelation
  = | { kind: 'auto' }
    | { kind: 'record' }
    | { kind: 'index' }

export function isDataContractBinding(binding: MaterialBinding | undefined): binding is DataContractBinding {
  return !!binding && !Array.isArray(binding) && 'kind' in binding && binding.kind === 'data-contract'
}

export function isBindingRef(binding: MaterialBinding | BindingRef | undefined): binding is BindingRef {
  return !!binding && !Array.isArray(binding) && !isDataContractBinding(binding)
}

export function getBindingRefs(binding: MaterialBinding | undefined): BindingRef[] {
  if (!binding || isDataContractBinding(binding))
    return []
  return Array.isArray(binding) ? binding : [binding]
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

export interface TableNode<TProps extends object = Record<string, unknown>> extends MaterialNode<TProps> {
  type: 'table-static' | 'table-data'
  table: TableSchema
}

/**
 * Typed props view for material-owned code. Schema loading keeps props open;
 * material packages own the compile-time shape for their own node type.
 */
export function getNodeProps<TProps extends object>(node: MaterialNode): TProps {
  return node.props as TProps
}

export interface TableSchema {
  kind: 'static' | 'data'
  topology: TableTopologySchema
  layout: TableLayoutConfig
  diagnostics?: LayoutDiagnostic[]
}

/** table-data specific schema. Cell-level absolute-path binding, no table-level source. */
export interface TableDataSchema extends TableSchema {
  kind: 'data'
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

/** Table-level typography defaults. Font family is optional for older schemas. */
export interface TableTypography {
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

/**
 * Per-cell border visibility. Each side is a boolean (default true = visible).
 * Width / color / type are inherited from table-level props (TableLayoutConfig).
 */
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
