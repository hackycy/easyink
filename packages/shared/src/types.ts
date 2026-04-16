/**
 * Unit types supported by the document model.
 * Schema stores values in the declared unit without normalization.
 */
export type UnitType = 'mm' | 'pt' | 'px'

/**
 * Page layout modes.
 * - fixed: Contracts, reports, multi-page documents with fixed page height
 * - stack: Continuous paper, receipts, long document flow
 * - label: Label paper, multi-column batch printing
 */
export type PageMode = 'fixed' | 'stack' | 'label'

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
export type MaterialGroup = 'quick' | 'data' | 'chart' | 'svg' | 'relation'

/**
 * Material category for the material catalog.
 */
export type MaterialCategory = 'basic' | 'data' | 'chart' | 'svg' | 'relation' | 'layout'

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
    | 'export-adapter'

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
