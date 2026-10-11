import type { MaterialModel } from '@easyink/plugin-api/material'
import { createRatingNode, RATING_CAPABILITIES, RATING_TYPE } from './schema'

export const ratingModel = {
  type: RATING_TYPE,
  createDefaultNode: createRatingNode,
  capabilities: RATING_CAPABILITIES,
  binding: { kind: 'ordinary', primaryProp: 'value', formatEditor: { tabs: ['custom'], defaultTab: 'custom' } },
} satisfies MaterialModel
