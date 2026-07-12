import type { PropertyDescriptor } from '@easyink/core'
import { STROKE_STYLE_OPTIONS } from '@easyink/prop-schemas'

export const qrcodeDesignerPropSchemas: PropertyDescriptor[] = [
  { key: 'value', label: 'materials.qrcode.property.value', type: 'string', group: 'content' },
  { key: 'size', label: 'designer.property.size', type: 'number', group: 'content', min: 10, max: 500, step: 1 },
  { key: 'errorCorrectionLevel', label: 'materials.qrcode.property.errorLevel', type: 'enum', group: 'content', enum: [
    { label: 'L (7%)', value: 'L' },
    { label: 'M (15%)', value: 'M' },
    { label: 'Q (25%)', value: 'Q' },
    { label: 'H (30%)', value: 'H' },
  ] },
  { key: 'foreground', label: 'materials.qrcode.property.foreground', type: 'color', group: 'appearance' },
  { key: 'background', label: 'designer.property.background', type: 'color', group: 'appearance' },
  { key: 'borderWidth', label: 'designer.property.borderWidth', type: 'number', group: 'border', min: 0, max: 20, step: 1 },
  { key: 'borderColor', label: 'designer.property.borderColor', type: 'color', group: 'border' },
  { key: 'borderType', label: 'designer.property.borderType', type: 'enum', group: 'border', enum: STROKE_STYLE_OPTIONS },
]
