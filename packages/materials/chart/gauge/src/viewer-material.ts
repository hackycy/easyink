import type { ViewerRenderContext } from '@easyink/core'
import type { ViewerMaterial } from '@easyink/plugin-api/viewer'
import type { MaterialNode } from '@easyink/schema'
import { chartGaugeModel } from './material-model'
import { renderChartGauge } from './viewer'

export { chartGaugeModel } from './material-model'
export * from './schema'
export * from './viewer'

export const chartGauge: ViewerMaterial = { model: chartGaugeModel, renderer: { render: (node, ctx) => renderChartGauge(node as MaterialNode, ctx as ViewerRenderContext) } }
