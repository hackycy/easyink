import { defineStandardMaterialManifest, recordSchemaAdapter } from '@easyink/core'
import { chartPieAIMaterialDescriptor } from './ai'
import { CHART_PIE_DATA_CONTRACT } from './data-contract'
import { createChartPieExtension } from './designer'
import { chartPieLocaleMessages } from './locale'
import { chartPieDesignerPropSchemas } from './prop-schemas'
import { CHART_PIE_TYPE, createChartPieNode } from './schema'
import { renderChartPie } from './viewer'

export const chartPieMaterialManifest = defineStandardMaterialManifest({
  type: CHART_PIE_TYPE,
  nameKey: 'materials.chartPie.name',
  category: 'chart',
  iconKey: 'chart-pie',
  catalogOrder: 30,
  defaultNode: createChartPieNode(),
  interaction: { rotatable: true, resizable: true },
  binding: { kind: 'ports', dataContract: CHART_PIE_DATA_CONTRACT, ports: [{ id: 'data', key: { kind: 'exact', value: 'value' }, role: 'semantic', valueShape: 'record-array', formatEditor: false }] },
  layout: { intrinsicSize: 'none', fragmentation: 'none', pageRepeat: 'none', overflow: 'clip' },
  properties: chartPieDesignerPropSchemas,
  schemaAdapter: recordSchemaAdapter(1),
  designerFactory: createChartPieExtension,
  localeMessages: chartPieLocaleMessages,
  viewerExtension: { render: renderChartPie },
  viewerCapabilities: { sanitizedMarkup: true },
  aiDescriptor: chartPieAIMaterialDescriptor,
})
