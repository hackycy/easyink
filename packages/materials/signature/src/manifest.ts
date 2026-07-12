import { defineStandardMaterialManifest, recordSchemaAdapter } from '@easyink/core'
import { signatureAIMaterialDescriptor } from './ai'
import { createSignatureExtension } from './designer'
import { signatureLocaleMessages } from './locale'
import { signatureDesignerPropSchemas } from './prop-schemas'
import { createSignatureNode, SIGNATURE_CONDITION, SIGNATURE_TYPE } from './schema'
import { renderSignature } from './viewer'

export const signatureMaterialManifest = defineStandardMaterialManifest({
  type: SIGNATURE_TYPE,
  nameKey: 'materials.signature.name',
  category: 'basic',
  iconKey: 'signature',
  catalogOrder: 110,
  defaultNode: createSignatureNode(),
  interaction: { rotatable: true, resizable: true },
  binding: { kind: 'none' },
  condition: SIGNATURE_CONDITION,
  layout: { intrinsicSize: 'none', fragmentation: 'none', pageRepeat: 'none', overflow: 'clip' },
  properties: signatureDesignerPropSchemas,
  schemaAdapter: recordSchemaAdapter(1),
  designerFactory: createSignatureExtension,
  localeMessages: signatureLocaleMessages,
  viewerExtension: { render: renderSignature },
  viewerCapabilities: { sanitizedMarkup: true },
  aiDescriptor: signatureAIMaterialDescriptor,
})
