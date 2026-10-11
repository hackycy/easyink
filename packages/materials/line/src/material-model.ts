import type { MaterialModel } from '@easyink/plugin-api/material'
import { createLineNode, LINE_CAPABILITIES, LINE_TYPE } from './schema'

export const lineModel = {
  type: LINE_TYPE,
  createDefaultNode: createLineNode,
  capabilities: LINE_CAPABILITIES,
  binding: { kind: 'none' },
} satisfies MaterialModel
