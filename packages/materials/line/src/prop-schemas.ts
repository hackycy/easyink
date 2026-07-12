import type { PropertyDescriptor } from '@easyink/core'
import { STROKE_STYLE_OPTIONS } from '@easyink/prop-schemas'

export const lineDesignerPropSchemas: PropertyDescriptor[] = [
  { key: 'lineColor', label: 'materials.line.property.lineColor', type: 'color', group: 'appearance' },
  { key: 'lineType', label: 'materials.line.property.lineType', type: 'enum', group: 'appearance', enum: STROKE_STYLE_OPTIONS },
]
