import type { MaterialModel } from '@easyink/plugin-api/material'
import { createFlowRowNode, FLOW_ROW_CAPABILITIES, FLOW_ROW_TYPE } from './schema'

export const flowRowModel = {
  type: FLOW_ROW_TYPE,
  createDefaultNode: createFlowRowNode,
  capabilities: FLOW_ROW_CAPABILITIES,
  binding: { kind: 'custom' },
} satisfies MaterialModel
