import type { ViewerRenderContext } from '@easyink/core'
import type { ViewerMaterial } from '@easyink/plugin-api/viewer'
import type { MaterialNode } from '@easyink/schema'
import { chartScatterModel } from './material-model'
import { renderChartScatter } from './viewer'

export { chartScatterModel } from './material-model'
export * from './schema'
export * from './viewer'

export const chartScatter: ViewerMaterial = { model: chartScatterModel, renderer: { render: (node, ctx) => renderChartScatter(node as MaterialNode, ctx as ViewerRenderContext) } }
