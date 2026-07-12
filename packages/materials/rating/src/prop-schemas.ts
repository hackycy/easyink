import type { PropertyDescriptor } from '@easyink/core'

export const ratingDesignerPropSchemas: PropertyDescriptor[] = [
  { key: 'value', label: 'materials.rating.property.value', type: 'number', group: 'content', min: 0, max: 100, step: 1 },
  { key: 'character', label: 'materials.rating.property.character', type: 'string', group: 'content', min: 1, max: 1 },
  { key: 'characterCount', label: 'materials.rating.property.characterCount', type: 'number', group: 'content', min: 1, max: 100, step: 1 },
  { key: 'characterSize', label: 'materials.rating.property.characterSize', type: 'number', group: 'appearance', min: 0.1, max: 200, step: 0.5 },
  { key: 'activeColor', label: 'materials.rating.property.activeColor', type: 'color', group: 'appearance' },
  { key: 'backgroundColor', label: 'materials.rating.property.backgroundColor', type: 'color', group: 'appearance' },
]
