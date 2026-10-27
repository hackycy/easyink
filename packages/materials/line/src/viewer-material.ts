import type { ViewerRenderContext } from '@easyink/core'
import type { ViewerMaterial } from '@easyink/plugin-api/viewer'
import type { MaterialNode } from '@easyink/schema'
import { lineModel } from './material-model'
import { getLineRenderSize, renderLine } from './viewer'

export { lineModel } from './material-model'
export * from './schema'
export * from './viewer'

export const line: ViewerMaterial = { model: lineModel, renderer: { render: (node, ctx) => renderLine(node as MaterialNode, ctx as ViewerRenderContext), getRenderSize: node => getLineRenderSize(node as MaterialNode) } }
