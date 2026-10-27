import type { MaterialModel } from '@easyink/plugin-api/material'
import { createQrcodeNode, QRCODE_CAPABILITIES, QRCODE_TYPE } from './schema'

export const qrcodeModel = {
  type: QRCODE_TYPE,
  createDefaultNode: createQrcodeNode,
  capabilities: QRCODE_CAPABILITIES,
  binding: { kind: 'ordinary', primaryProp: 'value', formatEditor: { tabs: ['preset', 'custom'], defaultTab: 'preset' } },
} satisfies MaterialModel
