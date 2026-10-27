import type { MaterialModel } from '@easyink/plugin-api/material'
import { createSignatureNode, SIGNATURE_CAPABILITIES, SIGNATURE_TYPE } from './schema'

export const signatureModel = {
  type: SIGNATURE_TYPE,
  createDefaultNode: createSignatureNode,
  capabilities: SIGNATURE_CAPABILITIES,
  binding: { kind: 'none' },
} satisfies MaterialModel
