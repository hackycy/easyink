import { defineStandardMaterialManifest, recordSchemaAdapter } from '@easyink/core'
import { ellipseAIMaterialDescriptor } from './ai'
import { createEllipseExtension } from './designer'
import { ellipseLocaleMessages } from './locale'
import { ellipseDesignerPropSchemas } from './prop-schemas'
import { createEllipseNode, ELLIPSE_CONDITION, ELLIPSE_TYPE } from './schema'
import { renderEllipse } from './viewer'

export const ellipseMaterialManifest = defineStandardMaterialManifest({
  type: ELLIPSE_TYPE,
  nameKey: 'materials.ellipse.name',
  category: 'basic',
  iconKey: 'ellipse',
  catalogOrder: 70,
  defaultNode: createEllipseNode(),
  interaction: { rotatable: true, resizable: true },
  binding: { kind: 'none' },
  condition: ELLIPSE_CONDITION,
  layout: { intrinsicSize: 'none', fragmentation: 'none', pageRepeat: 'none', overflow: 'clip' },
  properties: ellipseDesignerPropSchemas,
  schemaAdapter: recordSchemaAdapter(1),
  designerFactory: createEllipseExtension,
  localeMessages: ellipseLocaleMessages,
  viewerExtension: { render: (node, context) => renderEllipse(node, context.cssUnit) },
  aiDescriptor: ellipseAIMaterialDescriptor,
  generation: { enabled: true, modelSchema: 'infer-from-default', bindingShape: 'infer-from-binding', examples: 'default-model', requiredModelPaths: ['/fillColor'] },
})
