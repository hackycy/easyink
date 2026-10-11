import type { ViewerRenderContext } from '@easyink/core'
import type { ViewerMaterial } from '@easyink/plugin-api/viewer'
import type { MaterialNode } from '@easyink/schema'
import { tableStaticModel } from './material-model'
import { renderTableStatic } from './viewer'

export { tableStaticModel } from './material-model'
export * from './schema'
export * from './viewer'

export const tableStatic: ViewerMaterial = { model: tableStaticModel, renderer: { render: (node, ctx) => renderTableStatic(node as MaterialNode, ctx as ViewerRenderContext) } }
