import type { ViewerRenderContext } from '@easyink/core'
import type { ViewerMaterial } from '@easyink/plugin-api/viewer'
import type { MaterialNode } from '@easyink/schema'
import { chartPieModel } from './material-model'
import { renderChartPie } from './viewer'

export { chartPieModel } from './material-model'
export * from './schema'
export * from './viewer'

export const chartPie: ViewerMaterial = { model: chartPieModel, renderer: { render: (node, ctx) => renderChartPie(node as MaterialNode, ctx as ViewerRenderContext) } }
