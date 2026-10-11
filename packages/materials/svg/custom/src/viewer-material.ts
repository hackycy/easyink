import type { ViewerMaterial } from '@easyink/plugin-api/viewer'
import type { MaterialNode } from '@easyink/schema'
import { svgCustomModel } from './material-model'
import { renderSvgCustom } from './viewer'

export { svgCustomModel } from './material-model'
export * from './schema'
export * from './viewer'

export const svgCustom: ViewerMaterial = { model: svgCustomModel, renderer: { render: (node, _ctx) => renderSvgCustom(node as MaterialNode) } }
