/**
 * PropSchema declarations for cell-level properties in the property panel overlay.
 * Used by table-data and table-static materials when pushing a cell-selected overlay.
 *
 * Type-compatible with PropSchemaLike from @easyink/core without importing it
 * (table-kernel deliberately avoids depending on core).
 */
const FONT_WEIGHT_OPTIONS = [
  { label: 'designer.option.normal', value: 'normal' },
  { label: 'designer.option.bold', value: 'bold' },
]

const FONT_STYLE_OPTIONS = [
  { label: 'designer.option.normal', value: 'normal' },
  { label: 'designer.option.italic', value: 'italic' },
]

const HORIZONTAL_ALIGN_OPTIONS = [
  { label: 'designer.option.alignLeft', value: 'left' },
  { label: 'designer.option.alignCenter', value: 'center' },
  { label: 'designer.option.alignRight', value: 'right' },
]

const VERTICAL_ALIGN_OPTIONS = [
  { label: 'designer.option.alignTop', value: 'top' },
  { label: 'designer.option.alignMiddle', value: 'middle' },
  { label: 'designer.option.alignBottom', value: 'bottom' },
]

export const CELL_PROP_SCHEMAS: Array<{
  key: string
  label: string
  type: string
  group?: string
  min?: number
  max?: number
  step?: number
  enum?: Array<{ label: string, value: unknown }>
}> = [
  { key: 'fontSize', label: 'designer.property.fontSize', type: 'number', group: 'cell-typography', min: 1, max: 100, step: 1 },
  { key: 'color', label: 'designer.property.color', type: 'color', group: 'cell-typography' },
  { key: 'fontWeight', label: 'designer.property.fontWeight', type: 'enum', group: 'cell-typography', enum: FONT_WEIGHT_OPTIONS },
  { key: 'fontStyle', label: 'designer.property.fontStyle', type: 'enum', group: 'cell-typography', enum: FONT_STYLE_OPTIONS },
  { key: 'textAlign', label: 'designer.property.textAlign', type: 'enum', group: 'cell-typography', enum: HORIZONTAL_ALIGN_OPTIONS },
  { key: 'verticalAlign', label: 'designer.property.verticalAlign', type: 'enum', group: 'cell-typography', enum: VERTICAL_ALIGN_OPTIONS },
  { key: 'padding', label: 'designer.property.padding', type: 'number', group: 'cell-layout', min: 0, max: 20, step: 1 },
  { key: 'border', label: 'designer.property.border', type: 'border-toggle', group: 'cell-border' },
]
