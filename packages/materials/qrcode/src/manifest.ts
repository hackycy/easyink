import { defineStandardMaterialManifest, recordSchemaAdapter } from '@easyink/core'
import { qrcodeAIMaterialDescriptor } from './ai'
import { createQrcodeExtension } from './designer'
import { qrcodeLocaleMessages } from './locale'
import { qrcodeDesignerPropSchemas } from './prop-schemas'
import { createQrcodeNode, QRCODE_CONDITION, QRCODE_TYPE } from './schema'
import { renderQrcode } from './viewer'

export const qrcodeMaterialManifest = defineStandardMaterialManifest({
  type: QRCODE_TYPE,
  nameKey: 'materials.qrcode.name',
  category: 'basic',
  iconKey: 'qrcode',
  catalogOrder: 40,
  defaultNode: createQrcodeNode(),
  interaction: { rotatable: true, resizable: true },
  binding: { kind: 'ports', ports: [{ id: 'value', key: { kind: 'exact', value: 'value' }, role: 'display', valueShape: 'scalar', modelPath: '/model/value', formatEditor: { tabs: ['preset'] } }] },
  condition: QRCODE_CONDITION,
  layout: { intrinsicSize: 'none', fragmentation: 'none', pageRepeat: 'none', overflow: 'clip' },
  properties: qrcodeDesignerPropSchemas,
  schemaAdapter: recordSchemaAdapter(1),
  designerFactory: createQrcodeExtension,
  localeMessages: qrcodeLocaleMessages,
  viewerExtension: { render: renderQrcode },
  viewerCapabilities: { sanitizedMarkup: true },
  aiDescriptor: qrcodeAIMaterialDescriptor,
  generation: { enabled: true, modelSchema: 'infer-from-default', bindingShape: 'infer-from-binding', examples: 'default-model', requiredModelPaths: ['/value'] },
})
