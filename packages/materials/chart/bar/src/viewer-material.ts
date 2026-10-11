import type { ViewerRenderContext } from '@easyink/core'
import type { ViewerMaterial } from '@easyink/plugin-api/viewer'
import type { MaterialNode } from '@easyink/schema'
import { chartBarModel } from './material-model'
import { renderChartBar } from './viewer'

export { chartBarModel } from './material-model'
export * from './schema'
export * from './viewer'

export const chartBar: ViewerMaterial = { model: chartBarModel, renderer: { render: (node, ctx) => renderChartBar(node as MaterialNode, ctx as ViewerRenderContext) } }
