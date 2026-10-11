import type { ViewerRenderContext } from '@easyink/core'
import type { ViewerMaterial } from '@easyink/plugin-api/viewer'
import type { MaterialNode } from '@easyink/schema'
import { ringProgressModel } from './material-model'
import { renderRingProgress } from './viewer'

export { ringProgressModel } from './material-model'
export * from './schema'
export * from './viewer'

export const ringProgress: ViewerMaterial = { model: ringProgressModel, renderer: { render: (node, ctx) => renderRingProgress(node as MaterialNode, ctx as ViewerRenderContext) } }
