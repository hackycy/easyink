import type { ViewerRenderContext } from '@easyink/core'
import type { ViewerMaterial } from '@easyink/plugin-api/viewer'
import type { MaterialNode } from '@easyink/schema'
import { progressModel } from './material-model'
import { renderProgress } from './viewer'

export { progressModel } from './material-model'
export * from './schema'
export * from './viewer'

export const progress: ViewerMaterial = { model: progressModel, renderer: { render: (node, ctx) => renderProgress(node as MaterialNode, ctx as ViewerRenderContext) } }
