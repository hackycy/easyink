import { defineStandardMaterialManifest, recordSchemaAdapter } from '@easyink/core'
import { chartBarAIMaterialDescriptor } from './ai'
import { CHART_BAR_DATA_CONTRACT } from './data-contract'
import { createChartBarExtension } from './designer'
import { chartBarLocaleMessages } from './locale'
import { chartBarDesignerPropSchemas } from './prop-schemas'
import { CHART_BAR_TYPE, createChartBarNode } from './schema'
import { renderChartBar } from './viewer'

export const chartBarMaterialManifest = defineStandardMaterialManifest({
  type: CHART_BAR_TYPE,
  nameKey: 'materials.chartBar.name',
  category: 'chart',
  iconKey: 'chart-bar',
  catalogOrder: 10,
  defaultNode: createChartBarNode(),
  interaction: { rotatable: true, resizable: true },
  binding: { kind: 'ports', dataContract: CHART_BAR_DATA_CONTRACT, ports: [{ id: 'data', key: { kind: 'exact', value: 'value' }, role: 'semantic', valueShape: 'record-array', formatEditor: false }] },
  layout: { intrinsicSize: 'none', fragmentation: 'none', pageRepeat: 'none', overflow: 'clip' },
  properties: chartBarDesignerPropSchemas,
  schemaAdapter: recordSchemaAdapter(1),
  designerFactory: createChartBarExtension,
  localeMessages: chartBarLocaleMessages,
  viewerExtension: { render: renderChartBar },
  viewerCapabilities: { sanitizedMarkup: true },
  aiDescriptor: chartBarAIMaterialDescriptor,
  generation: { enabled: true, modelSchema: 'infer-from-default', bindingShape: 'infer-from-binding', examples: 'default-model', requiredModelPaths: ['/backgroundColor'] },
})
