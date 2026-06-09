import type { PropSchema } from '@easyink/core'
import { UpdateMaterialPropsCommand } from '@easyink/core'
import { normalizeRatingCharacter } from './rendering'

export const ratingDesignerPropSchemas: PropSchema[] = [
  { key: 'value', label: 'materials.rating.property.value', type: 'number', group: 'content', min: 0, max: 100, step: 1 },
  {
    key: 'character',
    label: 'materials.rating.property.character',
    type: 'string',
    group: 'content',
    commit: (node, value) => new UpdateMaterialPropsCommand([node], node.id, {
      character: normalizeRatingCharacter(value),
    }),
  },
  { key: 'characterCount', label: 'materials.rating.property.characterCount', type: 'number', group: 'content', min: 1, max: 100, step: 1 },
  { key: 'characterSize', label: 'materials.rating.property.characterSize', type: 'number', group: 'appearance', min: 0.1, max: 200, step: 0.5 },
  { key: 'activeColor', label: 'materials.rating.property.activeColor', type: 'color', group: 'appearance' },
  { key: 'backgroundColor', label: 'materials.rating.property.backgroundColor', type: 'color', group: 'appearance' },
]
