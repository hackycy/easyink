import type { ViewerRenderContext } from '@easyink/core'
import type { ViewerMaterial } from '@easyink/plugin-api/viewer'
import type { MaterialNode } from '@easyink/schema'
import { barcodeModel } from './material-model'
import { renderBarcode } from './viewer'

export { barcodeModel } from './material-model'
export * from './schema'
export * from './viewer'

export const barcode: ViewerMaterial = { model: barcodeModel, renderer: { render: (node, ctx) => renderBarcode(node as MaterialNode, ctx as ViewerRenderContext) } }
