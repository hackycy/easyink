import type { MaterialModel } from '@easyink/plugin-api/material'
import { createTextNode, TEXT_CAPABILITIES, TEXT_TYPE } from './schema'

export const textModel = {
  type: TEXT_TYPE,
  createDefaultNode: createTextNode,
  capabilities: TEXT_CAPABILITIES,
  binding: { kind: 'ordinary', primaryProp: 'content', formatEditor: { tabs: ['preset', 'custom'], defaultTab: 'preset' } },
} satisfies MaterialModel
