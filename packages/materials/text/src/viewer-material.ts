import type { ViewerMeasureContext, ViewerRenderContext } from '@easyink/core'
import type { ViewerMaterial } from '@easyink/plugin-api/viewer'
import type { MaterialNode } from '@easyink/schema'
import { textModel } from './material-model'
import { getTextRenderSize, measureText, renderText } from './viewer'

export { textModel } from './material-model'
export * from './schema'
export * from './viewer'

export const text: ViewerMaterial = { model: textModel, renderer: { render: (node, ctx) => renderText(node as MaterialNode, ctx as ViewerRenderContext), measure: (node, ctx) => measureText(node as MaterialNode, ctx as ViewerMeasureContext), getRenderSize: (node, ctx) => getTextRenderSize(node as MaterialNode, ctx as ViewerRenderContext) } }
