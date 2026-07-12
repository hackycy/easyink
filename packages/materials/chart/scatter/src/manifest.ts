import { defineStandardMaterialManifest, recordSchemaAdapter } from '@easyink/core'
import { chartScatterAIMaterialDescriptor } from './ai'
import { CHART_SCATTER_DATA_CONTRACT } from './data-contract'
import { createChartScatterExtension } from './designer'
import { chartScatterLocaleMessages } from './locale'
import { chartScatterDesignerPropSchemas } from './prop-schemas'
import { CHART_SCATTER_TYPE, createChartScatterNode } from './schema'
import { renderChartScatter } from './viewer'

export const chartScatterMaterialManifest = defineStandardMaterialManifest({
  type: CHART_SCATTER_TYPE,
  nameKey: 'materials.chartScatter.name',
  category: 'chart',
  iconKey: 'chart-scatter',
  catalogOrder: 50,
  defaultNode: createChartScatterNode(),
  interaction: { rotatable: true, resizable: true },
  binding: { kind: 'ports', dataContract: CHART_SCATTER_DATA_CONTRACT, ports: [{ id: 'data', key: { kind: 'exact', value: 'value' }, role: 'semantic', valueShape: 'record-array', formatEditor: false }] },
  layout: { intrinsicSize: 'none', fragmentation: 'none', pageRepeat: 'none', overflow: 'clip' },
  properties: chartScatterDesignerPropSchemas,
  schemaAdapter: recordSchemaAdapter(1),
  designerFactory: createChartScatterExtension,
  localeMessages: chartScatterLocaleMessages,
  viewerExtension: { render: renderChartScatter },
  viewerCapabilities: { sanitizedMarkup: true },
  aiDescriptor: chartScatterAIMaterialDescriptor,
  generation: { enabled: true, modelSchema: 'infer-from-default', bindingShape: 'infer-from-binding', examples: 'default-model', requiredModelPaths: ['/symbolSize'] },
})
