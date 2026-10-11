import type { DesignerMaterial } from '@easyink/plugin-api/ui'
import { IconQrcode } from '@easyink/icons'
import { paletteGroups } from '@easyink/shared'
import { qrcodeAIMaterialDescriptor } from './ai'
import { createQrcodeExtension } from './designer'
import { qrcodeLocaleMessages } from './locale'
import { qrcodeModel } from './material-model'
import { qrcodeDesignerPropSchemas } from './prop-schemas'

export const qrcode: DesignerMaterial = {
  model: qrcodeModel,
  renderer: createQrcodeExtension,
  properties: qrcodeDesignerPropSchemas,
  ai: qrcodeAIMaterialDescriptor,
  locale: qrcodeLocaleMessages,
  ui: { palette: [{ id: 'qrcode', label: 'materials.qrcode.name', icon: IconQrcode, group: paletteGroups.basic, order: 5 }] },
}
