import type { MaterialModel } from '@easyink/plugin-api/material'
import { createRectNode, RECT_CAPABILITIES, RECT_TYPE } from './schema'

export const rectModel = {
  type: RECT_TYPE,
  createDefaultNode: createRectNode,
  capabilities: RECT_CAPABILITIES,
  binding: { kind: 'none' },
} satisfies MaterialModel
