import type { DesignerMaterial } from '@easyink/plugin-api/ui'
import { IconRating } from '@easyink/icons'
import { paletteGroups } from '@easyink/shared'
import { ratingAIMaterialDescriptor } from './ai'
import { createRatingExtension } from './designer'
import { ratingLocaleMessages } from './locale'
import { ratingModel } from './material-model'
import { ratingDesignerPropSchemas } from './prop-schemas'

export const rating: DesignerMaterial = {
  model: ratingModel,
  renderer: createRatingExtension,
  properties: ratingDesignerPropSchemas,
  ai: ratingAIMaterialDescriptor,
  locale: ratingLocaleMessages,
  ui: { palette: [{ id: 'rating', label: 'materials.rating.name', icon: IconRating, group: paletteGroups.data, order: 5 }] },
}
