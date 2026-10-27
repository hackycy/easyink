import type { ViewerRenderContext } from '@easyink/core'
import type { ViewerMaterial } from '@easyink/plugin-api/viewer'
import type { MaterialNode } from '@easyink/schema'
import { chartCustomModel } from './material-model'
import { renderChartCustom } from './viewer'

export { chartCustomModel } from './material-model'
export * from './schema'
export * from './viewer'

export const chartCustom: ViewerMaterial = { model: chartCustomModel, renderer: { render: (node, ctx) => renderChartCustom(node as MaterialNode, ctx as ViewerRenderContext) } }
