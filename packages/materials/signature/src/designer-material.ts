import type { DesignerMaterial } from '@easyink/plugin-api/ui'
import { IconSignature } from '@easyink/icons'
import { paletteGroups } from '@easyink/shared'
import { createSignatureExtension } from './designer'
import { signatureLocaleMessages } from './locale'
import { signatureModel } from './material-model'
import { signatureDesignerPropSchemas } from './prop-schemas'

export const signature: DesignerMaterial = {
  model: signatureModel,
  renderer: createSignatureExtension,
  properties: signatureDesignerPropSchemas,
  locale: signatureLocaleMessages,
  ui: { palette: [{ id: 'signature', label: 'materials.signature.name', icon: IconSignature, group: paletteGroups.basic, order: 7 }] },
}
