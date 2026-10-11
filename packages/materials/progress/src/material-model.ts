import type { MaterialModel } from '@easyink/plugin-api/material'
import { createProgressNode, PROGRESS_CAPABILITIES, PROGRESS_TYPE } from './schema'

export const progressModel = {
  type: PROGRESS_TYPE,
  createDefaultNode: createProgressNode,
  capabilities: PROGRESS_CAPABILITIES,
  binding: { kind: 'ordinary', primaryProp: 'value', formatEditor: { tabs: ['custom'], defaultTab: 'custom' } },
} satisfies MaterialModel
