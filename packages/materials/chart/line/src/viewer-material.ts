import type { ViewerRenderContext } from '@easyink/core'
import type { ViewerMaterial } from '@easyink/plugin-api/viewer'
import type { MaterialNode } from '@easyink/schema'
import { chartLineModel } from './material-model'
import { renderChartLine } from './viewer'

export { chartLineModel } from './material-model'
export * from './schema'
export * from './viewer'

export const chartLine: ViewerMaterial = { model: chartLineModel, renderer: { render: (node, ctx) => renderChartLine(node as MaterialNode, ctx as ViewerRenderContext) } }
