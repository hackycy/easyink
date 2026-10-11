import type { ViewerMaterial } from '@easyink/plugin-api/viewer'
import type { MaterialNode } from '@easyink/schema'
import { ellipseModel } from './material-model'
import { renderEllipse } from './viewer'

export { ellipseModel } from './material-model'
export * from './schema'
export * from './viewer'

export const ellipse: ViewerMaterial = { model: ellipseModel, renderer: { render: (node, ctx) => renderEllipse(node as MaterialNode, ctx.unit) } }
