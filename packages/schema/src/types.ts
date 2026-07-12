import type {
  BackgroundRepeat,
  BindingDisplayFormat,
  BlankPolicy,
  LayoutStrategyKind,
  MaterialUseToken,
  PageMode,
  PageModelKind,
  PageScale,
  PaginationStrategyKind,
  PrintBehavior,
  ReflowStrategyKind,
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
  elements?: MaterialNodeInput[]
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

export type MaterialBindingMap = Record<string, MaterialBinding>
export type MaterialSlotMap = Record<string, MaterialNode[]>

export interface MaterialEditorState {
  name?: string
  locked?: boolean
  hidden?: boolean
}

export interface MaterialOutput {
  visibility: 'include' | 'remove' | 'reserve'
  renderCondition?: RenderCondition
  print?: PrintBehavior
  placement?: NodePlacementConfig
  break?: NodeBreakConfig
  repeat?: NodeRepeatConfig
  animations?: AnimationSchema[]
}

export interface MaterialNode<TModel = Record<string, unknown>> {
  id: string
  type: string
  x: number
  y: number
  width: number
  height: number
  rotation?: number
  alpha?: number
  zIndex?: number
  modelVersion: number
  model: TModel
  slots: MaterialSlotMap
  bindings: MaterialBindingMap
  editorState?: MaterialEditorState
  output: MaterialOutput
  extensions?: Record<string, unknown>
  compat?: BenchmarkElementCompatState
}

export interface LegacyMaterialNodeInput extends Record<string, unknown> {
  id?: unknown
  type?: unknown
  props?: unknown
  binding?: unknown
  children?: unknown
  table?: unknown
  unit?: unknown
}

export type MaterialNodeInput = MaterialNode | LegacyMaterialNodeInput

export interface BenchmarkElementCompatState {
  [key: string]: unknown
  rawProps?: Record<string, unknown>
  rawBind?: unknown
  passthrough?: Record<string, unknown>
}

// ─── Binding ───────────────────────────────────────────────────────

export interface BindingRef {
  kind?: never
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

/** Typed model view for code inside the material package. */
export function getNodeModel<TModel>(node: MaterialNode<unknown>): TModel {
  return node.model as TModel
}

export function getNodeBinding(node: MaterialNode, port = 'value'): MaterialBinding | undefined {
  return node.bindings[port]
}

export function getDefaultMaterialSlot(node: MaterialNode): MaterialNode[] {
  return node.slots.default ?? []
}

export function isNodeEditorHidden(node: MaterialNode): boolean {
  return node.editorState?.hidden === true
}

/** Finalizes a material-package factory result as a canonical v1 node envelope. */
export function canonicalizeMaterialNode<TModel>(
  type: string,
  candidate: Partial<MaterialNode<TModel>> & Record<string, unknown>,
): MaterialNode<TModel> {
  const {
    id,
    x,
    y,
    width,
    height,
    rotation,
    alpha,
    zIndex,
    model,
    slots,
    bindings,
    editorState,
    output,
    extensions,
    compat,
  } = candidate

  return {
    id: id as string,
    type,
    x: x as number,
    y: y as number,
    width: width as number,
    height: height as number,
    ...(rotation !== undefined ? { rotation } : {}),
    ...(alpha !== undefined ? { alpha } : {}),
    ...(zIndex !== undefined ? { zIndex } : {}),
    modelVersion: 1,
    model: (model ?? {}) as TModel,
    slots: slots ?? {},
    bindings: bindings ?? {},
    ...(editorState !== undefined ? { editorState } : {}),
    output: { visibility: 'include', ...output },
    ...(extensions !== undefined ? { extensions } : {}),
    ...(compat !== undefined ? { compat } : {}),
  }
}
