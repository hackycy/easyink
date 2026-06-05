import type { PropSchema } from '@easyink/core'

export const svgStarDesignerPropSchemas: PropSchema[] = [
  { key: 'fillColor', label: 'materials.svgStar.property.fillColor', type: 'color', group: 'appearance' },
  { key: 'borderWidth', label: 'designer.property.borderWidth', type: 'number', group: 'border', min: 0, max: 20, step: 0.1 },
  { key: 'borderColor', label: 'designer.property.borderColor', type: 'color', group: 'border' },
  { key: 'starPoints', label: 'materials.svgStar.property.points', type: 'number', group: 'shape', min: 3, max: 24, step: 1 },
  { key: 'starInnerRatio', label: 'materials.svgStar.property.innerRatio', type: 'number', group: 'shape', min: 0.08, max: 0.95, step: 0.01 },
]
