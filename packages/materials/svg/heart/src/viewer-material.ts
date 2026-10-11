import type { ViewerMaterial } from '@easyink/plugin-api/viewer'
import type { MaterialNode } from '@easyink/schema'
import { svgHeartModel } from './material-model'
import { renderSvgHeart } from './viewer'

export { svgHeartModel } from './material-model'
export * from './schema'
export * from './viewer'

export const svgHeart: ViewerMaterial = { model: svgHeartModel, renderer: { render: (node, ctx) => renderSvgHeart(node as MaterialNode, ctx.unit) } }
