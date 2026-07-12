import { defineStandardMaterialManifest, recordSchemaAdapter } from '@easyink/core'
import { progressAIMaterialDescriptor } from './ai'
import { createProgressExtension } from './designer'
import { progressLocaleMessages } from './locale'
import { progressDesignerPropSchemas } from './prop-schemas'
import { createProgressNode, PROGRESS_TYPE } from './schema'
import { renderProgress } from './viewer'

export const progressMaterialManifest = defineStandardMaterialManifest({
  type: PROGRESS_TYPE,
  nameKey: 'materials.progress.name',
  category: 'basic',
  iconKey: 'progress',
  catalogOrder: 80,
  defaultNode: createProgressNode(),
  interaction: { rotatable: true, resizable: true },
  binding: { kind: 'ports', ports: [{ id: 'value', key: { kind: 'exact', value: 'value' }, role: 'display', valueShape: 'scalar', modelPath: '/model/value', formatEditor: { tabs: ['preset'] } }] },
  layout: { intrinsicSize: 'none', fragmentation: 'none', pageRepeat: 'none', overflow: 'clip' },
  properties: progressDesignerPropSchemas,
  schemaAdapter: recordSchemaAdapter(1),
  designerFactory: createProgressExtension,
  localeMessages: progressLocaleMessages,
  viewerExtension: { render: renderProgress },
  aiDescriptor: progressAIMaterialDescriptor,
  generation: { enabled: true, modelSchema: 'infer-from-default', bindingShape: 'infer-from-binding', examples: 'default-model', requiredModelPaths: ['/value'] },
})
