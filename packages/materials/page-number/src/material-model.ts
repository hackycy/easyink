import type { MaterialModel } from '@easyink/plugin-api/material'
import { createPageNumberNode, PAGE_NUMBER_CAPABILITIES, PAGE_NUMBER_TYPE } from './schema'

export const pageNumberModel = {
  type: PAGE_NUMBER_TYPE,
  createDefaultNode: createPageNumberNode,
  capabilities: PAGE_NUMBER_CAPABILITIES,
  binding: { kind: 'none' },
  pageAware: PAGE_NUMBER_CAPABILITIES.pageAware,
} satisfies MaterialModel
