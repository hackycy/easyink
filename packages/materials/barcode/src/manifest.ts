import { defineStandardMaterialManifest, recordSchemaAdapter } from '@easyink/core'
import { barcodeAIMaterialDescriptor } from './ai'
import { createBarcodeExtension } from './designer'
import { barcodeLocaleMessages } from './locale'
import { barcodeDesignerPropSchemas } from './prop-schemas'
import { BARCODE_CONDITION, BARCODE_TYPE, createBarcodeNode } from './schema'
import { renderBarcode } from './viewer'

export const barcodeMaterialManifest = defineStandardMaterialManifest({
  type: BARCODE_TYPE,
  nameKey: 'materials.barcode.name',
  category: 'basic',
  iconKey: 'barcode',
  catalogOrder: 30,
  defaultNode: createBarcodeNode(),
  interaction: { rotatable: true, resizable: true, supportsAnimation: false, supportsUnionDrop: false },
  binding: { kind: 'ports', ports: [{ id: 'value', key: { kind: 'exact', value: 'value' }, role: 'display', valueShape: 'scalar', modelPath: '/model/value', formatEditor: { tabs: ['preset'] } }] },
  condition: BARCODE_CONDITION,
  layout: { intrinsicSize: 'none', fragmentation: 'none', pageRepeat: 'none', overflow: 'clip' },
  properties: barcodeDesignerPropSchemas,
  schemaAdapter: recordSchemaAdapter(1),
  designerFactory: createBarcodeExtension,
  localeMessages: barcodeLocaleMessages,
  viewerExtension: { render: renderBarcode },
  viewerCapabilities: { sanitizedMarkup: true },
  aiDescriptor: barcodeAIMaterialDescriptor,
})
