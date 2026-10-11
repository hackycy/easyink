import type { ViewerMaterial } from '@easyink/plugin-api/viewer'
import type { MaterialNode } from '@easyink/schema'
import { imageModel } from './material-model'
import { renderImage } from './viewer'

export { imageModel } from './material-model'
export * from './schema'
export * from './viewer'

export const image: ViewerMaterial = { model: imageModel, renderer: { render: (node, ctx) => renderImage(node as MaterialNode, ctx.unit) } }
