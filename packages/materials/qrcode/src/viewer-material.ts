import type { ViewerMaterial } from '@easyink/plugin-api/viewer'
import type { MaterialNode } from '@easyink/schema'
import { qrcodeModel } from './material-model'
import { renderQrcode } from './viewer'

export { qrcodeModel } from './material-model'
export * from './schema'
export * from './viewer'

export const qrcode: ViewerMaterial = { model: qrcodeModel, renderer: { render: (node, _ctx) => renderQrcode(node as MaterialNode) } }
