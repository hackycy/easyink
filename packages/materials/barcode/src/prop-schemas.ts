import type { PropertyDescriptor } from '@easyink/core'
import { STROKE_STYLE_OPTIONS } from '@easyink/prop-schemas'
import { BARCODE_FORMATS } from './schema'

export const barcodeDesignerPropSchemas: PropertyDescriptor[] = [
  { key: 'value', label: 'materials.barcode.property.value', type: 'string', group: 'content' },
  { key: 'format', label: 'materials.barcode.property.format', type: 'enum', group: 'content', enum: BARCODE_FORMATS.map(format => ({ label: format.label, value: format.value })) },
  { key: 'showText', label: 'materials.barcode.property.showText', type: 'switch', group: 'content' },
  { key: 'lineWidth', label: 'materials.barcode.property.lineWidth', type: 'number', group: 'appearance', min: 1, max: 5, step: 1 },
  { key: 'lineColor', label: 'materials.barcode.property.lineColor', type: 'color', group: 'appearance' },
  { key: 'backgroundColor', label: 'designer.property.background', type: 'color', group: 'appearance' },
  { key: 'borderWidth', label: 'designer.property.borderWidth', type: 'number', group: 'border', min: 0, max: 20, step: 1 },
  { key: 'borderColor', label: 'designer.property.borderColor', type: 'color', group: 'border' },
  { key: 'borderType', label: 'designer.property.borderType', type: 'enum', group: 'border', enum: STROKE_STYLE_OPTIONS },
]
