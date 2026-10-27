import type { ViewerRenderContext } from '@easyink/core'
import type { ViewerMaterial } from '@easyink/plugin-api/viewer'
import type { MaterialNode } from '@easyink/schema'
import { pageNumberModel } from './material-model'
import { renderPageNumber } from './viewer'

export { pageNumberModel } from './material-model'
export * from './schema'
export * from './viewer'

export const pageNumber: ViewerMaterial = { model: pageNumberModel, renderer: { render: (node, ctx) => renderPageNumber(node as MaterialNode, ctx as ViewerRenderContext) } }
