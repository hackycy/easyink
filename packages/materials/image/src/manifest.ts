import { defineStandardMaterialManifest, recordSchemaAdapter } from '@easyink/core'
import { imageAIMaterialDescriptor } from './ai'
import { createImageExtension } from './designer'
import { imageLocaleMessages } from './locale'
import { imageDesignerPropSchemas } from './prop-schemas'
import { createImageNode, IMAGE_CONDITION, IMAGE_TYPE } from './schema'
import { renderImage } from './viewer'

export const imageMaterialManifest = defineStandardMaterialManifest({
  type: IMAGE_TYPE,
  nameKey: 'materials.image.name',
  category: 'basic',
  iconKey: 'image',
  catalogOrder: 20,
  defaultNode: createImageNode(),
  interaction: { rotatable: true, resizable: true, supportsAnimation: true, supportsUnionDrop: false },
  binding: { kind: 'ports', ports: [{ id: 'src', key: { kind: 'exact', value: 'src' }, role: 'display', valueShape: 'scalar', modelPath: '/model/src', formatEditor: { tabs: ['preset'] } }] },
  condition: IMAGE_CONDITION,
  layout: { intrinsicSize: 'none', fragmentation: 'none', pageRepeat: 'none', overflow: 'clip' },
  properties: imageDesignerPropSchemas,
  schemaAdapter: recordSchemaAdapter(1),
  designerFactory: createImageExtension,
  localeMessages: imageLocaleMessages,
  viewerExtension: { render: renderImage },
  aiDescriptor: imageAIMaterialDescriptor,
  generation: { enabled: true, modelSchema: 'infer-from-default', bindingShape: 'infer-from-binding', examples: 'default-model', requiredModelPaths: ['/src'] },
})
