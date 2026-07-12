import type { PropertyDescriptor } from '@easyink/core'

export const svgHeartDesignerPropSchemas: PropertyDescriptor[] = [
  { key: 'fillColor', label: 'materials.svgHeart.property.fillColor', type: 'color', group: 'appearance' },
  { key: 'borderWidth', label: 'designer.property.borderWidth', type: 'number', group: 'border', min: 0, max: 20, step: 0.1 },
  { key: 'borderColor', label: 'designer.property.borderColor', type: 'color', group: 'border' },
]
