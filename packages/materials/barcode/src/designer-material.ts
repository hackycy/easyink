import type { DesignerMaterial } from '@easyink/plugin-api/ui'
import { IconBarcode } from '@easyink/icons'
import { paletteGroups } from '@easyink/shared'
import { barcodeAIMaterialDescriptor } from './ai'
import { createBarcodeExtension } from './designer'
import { barcodeLocaleMessages } from './locale'
import { barcodeModel } from './material-model'
import { barcodeDesignerPropSchemas } from './prop-schemas'

export const barcode: DesignerMaterial = {
  model: barcodeModel,
  renderer: createBarcodeExtension,
  properties: barcodeDesignerPropSchemas,
  ai: barcodeAIMaterialDescriptor,
  locale: barcodeLocaleMessages,
  ui: { palette: [{ id: 'barcode', label: 'materials.barcode.name', icon: IconBarcode, group: paletteGroups.basic, order: 6 }] },
}
