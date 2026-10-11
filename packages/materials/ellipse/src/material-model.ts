import type { MaterialModel } from '@easyink/plugin-api/material'
import { createEllipseNode, ELLIPSE_CAPABILITIES, ELLIPSE_TYPE } from './schema'

export const ellipseModel = {
  type: ELLIPSE_TYPE,
  createDefaultNode: createEllipseNode,
  capabilities: ELLIPSE_CAPABILITIES,
  binding: { kind: 'none' },
} satisfies MaterialModel
