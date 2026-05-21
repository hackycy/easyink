/**
 * Unit types supported by the document model.
 * Schema stores values in the declared unit without normalization.
 */
export type UnitType = 'mm' | 'pt' | 'px' | 'inch'

/**
 * Page medium types.
 * - fixed: Contracts, reports, multi-page documents with fixed page height
 * - continuous: Continuous paper, receipts, long document flow
 */
export type PageMode = 'fixed' | 'continuous'

/**
 * Orthogonal page medium model kinds.
 * Layout, pagination, and reflow are modeled separately from this dimension.
 */
export type PageModelKind = 'paged-paper' | 'continuous-paper'

export type LayoutStrategyKind = 'absolute' | 'stack-flow' | 'region-flow'

export type PaginationStrategyKind = 'none' | 'fixed-sheets' | 'auto-sheets'

export type ReflowStrategyKind = 'none' | 'measure-only' | 'flow-y'

/**
 * Page scale strategy.
 * - 'auto': Automatic scaling
 * - 'fit-width': Fit to page width
 * - 'fit-height': Fit to page height
 * - number: Explicit scale factor (1 = 100%)
 */
export type PageScale = 'auto' | 'fit-width' | 'fit-height' | number

/**
 * Blank page policy for multi-page documents.
 * - keep: Keep blank pages
 * - remove: Remove blank pages
 * - auto: Automatically decide
 */
export type BlankPolicy = 'keep' | 'remove' | 'auto'

/**
 * Print behavior: which pages an element appears on.
 */
export type PrintBehavior = 'each' | 'odd' | 'even' | 'first' | 'last'

/**
 * Material catalog group classification.
 */
export type MaterialGroup = 'quick' | 'data' | 'chart' | 'svg' | 'utility'

/**
 * Material category for the material catalog.
 */
export type MaterialCategory = 'basic' | 'data' | 'chart' | 'svg' | 'utility' | 'layout'

/**
 * Material use token for recommended drag-create material type.
 */
export type MaterialUseToken
  = | 'text'
    | 'image'
    | 'barcode'
    | 'qrcode'
    | 'rich-text'
    | (string & {})

/**
 * Built-in display formatter tokens stored on a binding reference.
 */
export type BindingFormatPresetType
  = | 'datetime'
    | 'weekday'
    | 'chinese-money'
    | 'number'
    | 'currency'
    | 'percent'

/**
 * Serializable preset formatter options. All fields are optional so new
 * presets can evolve without forcing old templates through a migration.
 */
export interface BindingPresetFormat {
  type: BindingFormatPresetType
  pattern?: string
  locale?: string
  timeZone?: string
  weekdayStyle?: 'long' | 'short' | 'narrow'
  minimumFractionDigits?: number
  maximumFractionDigits?: number
  currency?: string
}

/**
 * Trusted template formatter source. First version stores a JavaScript
 * function expression such as `(value, ctx) => String(value)`.
 */
export interface BindingCustomFormat {
  source: string
}

/**
 * Display formatting owned by a binding: fallback, preset/custom formatter,
 * then optional prefix/suffix decoration.
 */
export interface BindingDisplayFormat {
  prefix?: string
  suffix?: string
  fallback?: string
  mode?: 'preset' | 'custom'
  preset?: BindingPresetFormat
  custom?: BindingCustomFormat
}

/**
 * Table row role for row-level semantics.
 */
export type TableRowRole = 'normal' | 'header' | 'footer' | 'repeat-template'

/**
 * Border appearance style for tables.
 */
export type BorderAppearance = 'outer' | 'inner' | 'all' | 'none'

/**
 * Border line type.
 */
export type BorderType = 'solid' | 'dashed' | 'dotted'

/**
 * Background repeat mode.
 */
export type BackgroundRepeat = 'full' | 'repeat' | 'repeat-x' | 'repeat-y' | 'none'

/**
 * Property schema type for material property definitions.
 */
export type PropSchemaType
  = | 'string'
    | 'number'
    | 'boolean'
    | 'switch'
    | 'textarea'
    | 'color'
    | 'enum'
    | 'object'
    | 'array'
    | 'rich-text'
    | 'image'
    | 'font'
    | 'unit'
    | 'border-toggle'

/**
 * Diagnostic severity levels.
 */
export type DiagnosticSeverity = 'error' | 'warning' | 'info'

/**
 * Diagnostic category.
 */
export type DiagnosticCategory
  = | 'schema'
    | 'datasource'
    | 'viewer'
    | 'material'
    | 'print'
    | 'exporter'

/**
 * Export format identifiers.
 */
export type ExportFormat = 'print' | 'pdf' | 'png' | 'jpg' | 'docx' | 'pptx' | (string & {})

/**
 * Export dispatch phase state machine.
 */
export type ExportPhase
  = | 'idle'
    | 'menu-open'
    | 'dispatching'
    | 'preparing'
    | 'exporting'
    | 'completed'
    | 'failed'

/**
 * Export trigger entry point.
 */
export type ExportEntry = 'save-menu' | 'preview' | 'api'

/**
 * Table editing phases in designer.
 * idle -> table-selected -> cell-selected -> content-editing
 */
export type TableEditingPhase = 'idle' | 'table-selected' | 'cell-selected' | 'content-editing'
