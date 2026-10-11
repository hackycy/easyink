import type { MaterialModel } from '@easyink/plugin-api/material'
import { createTableStaticNode, TABLE_STATIC_CAPABILITIES, TABLE_STATIC_TYPE } from './schema'

export const tableStaticModel = {
  type: TABLE_STATIC_TYPE,
  createDefaultNode: createTableStaticNode,
  capabilities: TABLE_STATIC_CAPABILITIES,
  binding: { kind: 'custom' },
} satisfies MaterialModel
