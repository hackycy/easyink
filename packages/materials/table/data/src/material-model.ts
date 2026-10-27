import type { MaterialModel } from '@easyink/plugin-api/material'
import { createTableDataNode, TABLE_DATA_CAPABILITIES, TABLE_DATA_TYPE } from './schema'

export const tableDataModel = {
  type: TABLE_DATA_TYPE,
  createDefaultNode: createTableDataNode,
  capabilities: TABLE_DATA_CAPABILITIES,
  binding: { kind: 'custom' },
} satisfies MaterialModel
