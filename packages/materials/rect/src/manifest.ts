import { defineStandardMaterialManifest, recordSchemaAdapter } from '@easyink/core'
import { rectAIMaterialDescriptor } from './ai'
import { createRectExtension } from './designer'
import { rectLocaleMessages } from './locale'
import { rectDesignerPropSchemas } from './prop-schemas'
import { createRectNode, RECT_CONDITION, RECT_TYPE } from './schema'
import { renderRect } from './viewer'

export const rectMaterialManifest = defineStandardMaterialManifest({
  type: RECT_TYPE,
  nameKey: 'materials.rect.name',
  category: 'basic',
  iconKey: 'rect',
  catalogOrder: 60,
  defaultNode: createRectNode(),
  interaction: { rotatable: true, resizable: true },
  binding: { kind: 'none' },
  condition: RECT_CONDITION,
  layout: { intrinsicSize: 'none', fragmentation: 'none', pageRepeat: 'none', overflow: 'clip' },
  properties: rectDesignerPropSchemas,
  schemaAdapter: recordSchemaAdapter(1),
  designerFactory: createRectExtension,
  localeMessages: rectLocaleMessages,
  viewerExtension: { render: (node, context) => renderRect(node, context.unit) },
  aiDescriptor: rectAIMaterialDescriptor,
  generation: { enabled: true, modelSchema: 'infer-from-default', bindingShape: 'infer-from-binding', examples: 'default-model', requiredModelPaths: ['/fillColor'] },
})
