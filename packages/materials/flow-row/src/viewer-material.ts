import type { ViewerMeasureContext, ViewerRenderContext } from '@easyink/core'
import type { ViewerMaterial } from '@easyink/plugin-api/viewer'
import type { MaterialNode } from '@easyink/schema'
import { flowRowModel } from './material-model'
import { measureFlowRow, renderFlowRow } from './viewer'

export { flowRowModel } from './material-model'
export * from './schema'
export * from './viewer'

export const flowRow: ViewerMaterial = { model: flowRowModel, renderer: { render: (node, ctx) => renderFlowRow(node as MaterialNode, ctx as ViewerRenderContext), measure: (node, ctx) => measureFlowRow(node as MaterialNode, ctx as ViewerMeasureContext) } }
