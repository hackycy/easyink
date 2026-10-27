import type { MaterialModel } from '@easyink/plugin-api/material'
import { createRingProgressNode, RING_PROGRESS_CAPABILITIES, RING_PROGRESS_TYPE } from './schema'

export const ringProgressModel = {
  type: RING_PROGRESS_TYPE,
  createDefaultNode: createRingProgressNode,
  capabilities: RING_PROGRESS_CAPABILITIES,
  binding: { kind: 'ordinary', primaryProp: 'value', formatEditor: { tabs: ['custom'], defaultTab: 'custom' } },
} satisfies MaterialModel
