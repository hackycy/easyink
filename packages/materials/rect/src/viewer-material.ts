import type { ViewerMaterial } from '@easyink/plugin-api/viewer'
import type { MaterialNode } from '@easyink/schema'
import { rectModel } from './material-model'
import { renderRect } from './viewer'

export { rectModel } from './material-model'
export * from './schema'
export * from './viewer'

export const rect: ViewerMaterial = { model: rectModel, renderer: { render: (node, ctx) => renderRect(node as MaterialNode, ctx.unit) } }
