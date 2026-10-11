import type { ViewerRenderContext } from '@easyink/core'
import type { ViewerMaterial } from '@easyink/plugin-api/viewer'
import type { MaterialNode } from '@easyink/schema'
import { chartRadarModel } from './material-model'
import { renderChartRadar } from './viewer'

export { chartRadarModel } from './material-model'
export * from './schema'
export * from './viewer'

export const chartRadar: ViewerMaterial = { model: chartRadarModel, renderer: { render: (node, ctx) => renderChartRadar(node as MaterialNode, ctx as ViewerRenderContext) } }
