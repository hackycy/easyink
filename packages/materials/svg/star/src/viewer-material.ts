import type { ViewerMaterial } from '@easyink/plugin-api/viewer'
import type { MaterialNode } from '@easyink/schema'
import { svgStarModel } from './material-model'
import { renderSvgStar } from './viewer'

export { svgStarModel } from './material-model'
export * from './schema'
export * from './viewer'

export const svgStar: ViewerMaterial = { model: svgStarModel, renderer: { render: (node, _ctx) => renderSvgStar(node as MaterialNode) } }
