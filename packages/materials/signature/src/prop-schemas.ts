import type { PropertyDescriptor } from '@easyink/core'

export const signatureDesignerPropSchemas: PropertyDescriptor[] = [
  { key: 'backgroundColor', label: 'materials.signature.property.backgroundColor', type: 'color', group: 'appearance' },
  { key: 'penColor', label: 'materials.signature.property.penColor', type: 'color', group: 'appearance' },
]
