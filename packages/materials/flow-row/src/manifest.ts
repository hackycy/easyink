import { defineStandardMaterialManifest } from '@easyink/core'
import { flowRowAIMaterialDescriptor } from './ai'
import { createFlowRowExtension } from './designer'
import { flowRowLocaleMessages } from './locale'
import { flowRowDesignerPropSchemas } from './prop-schemas'
import { createFlowRowNode, FLOW_ROW_TYPE } from './schema'
import { flowRowSchemaAdapter } from './schema-adapter'
import { flowRowViewerLayout, renderFlowRow } from './viewer'

export const flowRowMaterialManifest = defineStandardMaterialManifest({
  type: FLOW_ROW_TYPE,
  nameKey: 'materials.flowRow.name',
  category: 'data',
  iconKey: 'flow-row',
  catalogOrder: 10,
  defaultNode: createFlowRowNode(),
  interaction: { rotatable: false, resizable: true },
  binding: { kind: 'ports', ports: [
    { id: 'collection', key: { kind: 'exact', value: 'value' }, role: 'semantic', valueShape: 'record-array', formatEditor: false },
    { id: 'columns', key: { kind: 'prefix', value: 'flow-port:' }, role: 'display', valueShape: 'scalar', modelPath: '/model/columns', formatEditor: { tabs: ['preset'] } },
  ] },
  layout: { intrinsicSize: 'height', fragmentation: 'none', pageRepeat: 'none', overflow: 'visible' },
  properties: flowRowDesignerPropSchemas,
  schemaAdapter: flowRowSchemaAdapter,
  designerFactory: createFlowRowExtension,
  localeMessages: flowRowLocaleMessages,
  viewerExtension: { render: renderFlowRow },
  viewerLayout: flowRowViewerLayout,
  aiDescriptor: flowRowAIMaterialDescriptor,
  generation: { enabled: true, modelSchema: 'infer-from-default', bindingShape: 'infer-from-binding', examples: 'default-model', requiredModelPaths: ['/columns'] },
})
