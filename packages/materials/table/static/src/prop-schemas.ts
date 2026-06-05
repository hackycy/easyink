import type { PropSchema } from '@easyink/core'
import {
  FONT_STYLE_OPTIONS,
  FONT_WEIGHT_OPTIONS,
  HORIZONTAL_ALIGN_OPTIONS,
  STROKE_STYLE_OPTIONS,
  VERTICAL_ALIGN_OPTIONS,
} from '@easyink/prop-schemas'

export const tableStaticDesignerPropSchemas: PropSchema[] = [
  { key: 'borderWidth', label: 'designer.property.borderWidth', type: 'number', group: 'table-border', min: 0, max: 10, step: 1 },
  { key: 'borderColor', label: 'designer.property.borderColor', type: 'color', group: 'table-border' },
  { key: 'borderType', label: 'designer.property.borderType', type: 'enum', group: 'table-border', enum: STROKE_STYLE_OPTIONS },
  { key: 'cellPadding', label: 'designer.property.padding', type: 'number', group: 'table-layout', min: 0, max: 20, step: 1 },
  { key: 'typography.fontFamily', label: 'designer.property.font', type: 'font', group: 'table-typography' },
  { key: 'typography.fontSize', label: 'designer.property.fontSize', type: 'number', group: 'table-typography', min: 1, max: 100, step: 1 },
  { key: 'typography.color', label: 'designer.property.color', type: 'color', group: 'table-typography' },
  { key: 'typography.fontWeight', label: 'designer.property.fontWeight', type: 'enum', group: 'table-typography', enum: FONT_WEIGHT_OPTIONS },
  { key: 'typography.fontStyle', label: 'designer.property.fontStyle', type: 'enum', group: 'table-typography', enum: FONT_STYLE_OPTIONS },
  { key: 'typography.textAlign', label: 'designer.property.textAlign', type: 'enum', group: 'table-typography', enum: HORIZONTAL_ALIGN_OPTIONS },
  { key: 'typography.verticalAlign', label: 'designer.property.verticalAlign', type: 'enum', group: 'table-typography', enum: VERTICAL_ALIGN_OPTIONS },
  { key: 'typography.lineHeight', label: 'designer.property.lineHeight', type: 'number', group: 'table-typography', min: 0.5, max: 5, step: 0.1 },
  { key: 'typography.letterSpacing', label: 'designer.property.letterSpacing', type: 'number', group: 'table-typography', min: -5, max: 20, step: 0.5 },
]
