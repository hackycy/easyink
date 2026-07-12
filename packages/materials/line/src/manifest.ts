import { defineStandardMaterialManifest, recordSchemaAdapter } from '@easyink/core'
import { lineAIMaterialDescriptor } from './ai'
import { createLineExtension } from './designer'
import { lineLocaleMessages } from './locale'
import { lineDesignerPropSchemas } from './prop-schemas'
import { createLineNode, LINE_CONDITION, LINE_TYPE } from './schema'
import { createLineViewerExtension } from './viewer'

export const lineMaterialManifest = defineStandardMaterialManifest({
  type: LINE_TYPE,
  nameKey: 'materials.line.name',
  category: 'basic',
  iconKey: 'line',
  catalogOrder: 50,
  defaultNode: createLineNode(),
  interaction: { rotatable: true, resizable: true },
  binding: { kind: 'none' },
  condition: LINE_CONDITION,
  layout: { intrinsicSize: 'none', fragmentation: 'none', pageRepeat: 'none', overflow: 'clip' },
  properties: lineDesignerPropSchemas,
  schemaAdapter: recordSchemaAdapter(1),
  designerFactory: createLineExtension,
  localeMessages: lineLocaleMessages,
  viewerExtension: createLineViewerExtension(),
  aiDescriptor: lineAIMaterialDescriptor,
  generation: { enabled: true, modelSchema: 'infer-from-default', bindingShape: 'infer-from-binding', examples: 'default-model', requiredModelPaths: ['/lineColor'] },
})
