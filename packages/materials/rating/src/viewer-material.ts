import type { ViewerRenderContext } from '@easyink/core'
import type { ViewerMaterial } from '@easyink/plugin-api/viewer'
import type { MaterialNode } from '@easyink/schema'
import { ratingModel } from './material-model'
import { renderRating } from './viewer'

export { ratingModel } from './material-model'
export * from './schema'
export * from './viewer'

export const rating: ViewerMaterial = { model: ratingModel, renderer: { render: (node, ctx) => renderRating(node as MaterialNode, ctx as ViewerRenderContext) } }
