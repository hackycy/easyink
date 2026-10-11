import type { MaterialModel } from '@easyink/plugin-api/material'
import { createImageNode, IMAGE_CAPABILITIES, IMAGE_TYPE } from './schema'

export const imageModel = {
  type: IMAGE_TYPE,
  createDefaultNode: createImageNode,
  capabilities: IMAGE_CAPABILITIES,
  binding: { kind: 'ordinary', primaryProp: 'src', formatEditor: { tabs: ['preset', 'custom'], defaultTab: 'preset' } },
} satisfies MaterialModel
