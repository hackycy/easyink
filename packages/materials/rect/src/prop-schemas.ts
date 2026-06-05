import type { PropSchema } from '@easyink/core'
import { STROKE_STYLE_OPTIONS } from '@easyink/prop-schemas'

export const rectDesignerPropSchemas: PropSchema[] = [
  { key: 'fillColor', label: 'materials.rect.property.fillColor', type: 'color', group: 'appearance' },
  { key: 'borderWidth', label: 'designer.property.borderWidth', type: 'number', group: 'border', min: 0, max: 20, step: 1 },
  { key: 'borderColor', label: 'designer.property.borderColor', type: 'color', group: 'border' },
  { key: 'borderType', label: 'designer.property.borderType', type: 'enum', group: 'border', enum: STROKE_STYLE_OPTIONS },
  { key: 'borderRadius', label: 'designer.property.borderRadius', type: 'number', group: 'border', min: 0, max: 100, step: 1 },
]
