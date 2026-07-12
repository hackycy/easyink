import { defineStandardMaterialManifest, recordSchemaAdapter } from '@easyink/core'
import { chartLineAIMaterialDescriptor } from './ai'
import { CHART_LINE_DATA_CONTRACT } from './data-contract'
import { createChartLineExtension } from './designer'
import { chartLineLocaleMessages } from './locale'
import { chartLineDesignerPropSchemas } from './prop-schemas'
import { CHART_LINE_TYPE, createChartLineNode } from './schema'
import { renderChartLine } from './viewer'

export const chartLineMaterialManifest = defineStandardMaterialManifest({
  type: CHART_LINE_TYPE,
  nameKey: 'materials.chartLine.name',
  category: 'chart',
  iconKey: 'chart-line',
  catalogOrder: 20,
  defaultNode: createChartLineNode(),
  interaction: { rotatable: true, resizable: true },
  binding: { kind: 'ports', dataContract: CHART_LINE_DATA_CONTRACT, ports: [{ id: 'data', key: { kind: 'exact', value: 'value' }, role: 'semantic', valueShape: 'record-array', formatEditor: false }] },
  layout: { intrinsicSize: 'none', fragmentation: 'none', pageRepeat: 'none', overflow: 'clip' },
  properties: chartLineDesignerPropSchemas,
  schemaAdapter: recordSchemaAdapter(1),
  designerFactory: createChartLineExtension,
  localeMessages: chartLineLocaleMessages,
  viewerExtension: { render: renderChartLine },
  viewerCapabilities: { sanitizedMarkup: true },
  aiDescriptor: chartLineAIMaterialDescriptor,
  generation: { enabled: true, modelSchema: 'infer-from-default', bindingShape: 'infer-from-binding', examples: 'default-model', requiredModelPaths: ['/backgroundColor'] },
})
