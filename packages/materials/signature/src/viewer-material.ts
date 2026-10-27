import type { ViewerMaterial } from '@easyink/plugin-api/viewer'
import type { MaterialNode } from '@easyink/schema'
import { signatureModel } from './material-model'
import { renderSignature } from './viewer'

export { signatureModel } from './material-model'
export * from './schema'
export * from './viewer'

export const signature: ViewerMaterial = { model: signatureModel, renderer: { render: (node, _ctx) => renderSignature(node as MaterialNode) } }
