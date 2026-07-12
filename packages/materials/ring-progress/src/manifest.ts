import { defineStandardMaterialManifest, recordSchemaAdapter } from '@easyink/core'
import { ringProgressAIMaterialDescriptor } from './ai'
import { createRingProgressExtension } from './designer'
import { ringProgressLocaleMessages } from './locale'
import { ringProgressDesignerPropSchemas } from './prop-schemas'
import { createRingProgressNode, RING_PROGRESS_TYPE } from './schema'
import { renderRingProgress } from './viewer'

export const ringProgressMaterialManifest = defineStandardMaterialManifest({
  type: RING_PROGRESS_TYPE,
  nameKey: 'materials.ringProgress.name',
  category: 'basic',
  iconKey: 'ring-progress',
  catalogOrder: 100,
  defaultNode: createRingProgressNode(),
  interaction: { rotatable: true, resizable: true, keepAspectRatio: true },
  binding: { kind: 'ports', ports: [{ id: 'value', key: { kind: 'exact', value: 'value' }, role: 'display', valueShape: 'scalar', modelPath: '/model/value', formatEditor: { tabs: ['preset'] } }] },
  layout: { intrinsicSize: 'none', fragmentation: 'none', pageRepeat: 'none', overflow: 'clip' },
  properties: ringProgressDesignerPropSchemas,
  schemaAdapter: recordSchemaAdapter(1),
  designerFactory: createRingProgressExtension,
  localeMessages: ringProgressLocaleMessages,
  viewerExtension: { render: renderRingProgress },
  aiDescriptor: ringProgressAIMaterialDescriptor,
  generation: { enabled: true, modelSchema: 'infer-from-default', bindingShape: 'infer-from-binding', examples: 'default-model', requiredModelPaths: ['/value'] },
})
