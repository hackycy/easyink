import { defineStandardMaterialManifest, recordSchemaAdapter } from '@easyink/core'
import { svgHeartAIMaterialDescriptor } from './ai'
import { createSvgHeartExtension } from './designer'
import { svgHeartLocaleMessages } from './locale'
import { svgHeartDesignerPropSchemas } from './prop-schemas'
import { createSvgHeartNode, SVG_HEART_TYPE } from './schema'
import { renderSvgHeart } from './viewer'

export const svgHeartMaterialManifest = defineStandardMaterialManifest({
  type: SVG_HEART_TYPE,
  nameKey: 'materials.svgHeart.name',
  category: 'svg',
  iconKey: 'svg-heart',
  catalogOrder: 20,
  defaultNode: createSvgHeartNode(),
  interaction: { rotatable: true, resizable: true },
  binding: { kind: 'none' },
  layout: { intrinsicSize: 'none', fragmentation: 'none', pageRepeat: 'none', overflow: 'clip' },
  properties: svgHeartDesignerPropSchemas,
  schemaAdapter: recordSchemaAdapter(1),
  designerFactory: createSvgHeartExtension,
  localeMessages: svgHeartLocaleMessages,
  viewerExtension: { render: (node, context) => renderSvgHeart(node, context.cssUnit) },
  aiDescriptor: svgHeartAIMaterialDescriptor,
  generation: { enabled: true, modelSchema: 'infer-from-default', bindingShape: 'infer-from-binding', examples: 'default-model', requiredModelPaths: ['/fillColor'] },
})
