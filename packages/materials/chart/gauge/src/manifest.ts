import { defineStandardMaterialManifest, recordSchemaAdapter } from '@easyink/core'
import { chartGaugeAIMaterialDescriptor } from './ai'
import { CHART_GAUGE_DATA_CONTRACT } from './data-contract'
import { createChartGaugeExtension } from './designer'
import { chartGaugeLocaleMessages } from './locale'
import { chartGaugeDesignerPropSchemas } from './prop-schemas'
import { CHART_GAUGE_TYPE, createChartGaugeNode } from './schema'
import { renderChartGauge } from './viewer'

export const chartGaugeMaterialManifest = defineStandardMaterialManifest({
  type: CHART_GAUGE_TYPE,
  nameKey: 'materials.chartGauge.name',
  category: 'chart',
  iconKey: 'chart-gauge',
  catalogOrder: 60,
  defaultNode: createChartGaugeNode(),
  interaction: { rotatable: true, resizable: true },
  binding: { kind: 'ports', dataContract: CHART_GAUGE_DATA_CONTRACT, ports: [{ id: 'data', key: { kind: 'exact', value: 'value' }, role: 'semantic', valueShape: 'record-array', formatEditor: false }] },
  layout: { intrinsicSize: 'none', fragmentation: 'none', pageRepeat: 'none', overflow: 'clip' },
  properties: chartGaugeDesignerPropSchemas,
  schemaAdapter: recordSchemaAdapter(1),
  designerFactory: createChartGaugeExtension,
  localeMessages: chartGaugeLocaleMessages,
  viewerExtension: { render: renderChartGauge },
  viewerCapabilities: { sanitizedMarkup: true },
  aiDescriptor: chartGaugeAIMaterialDescriptor,
})
