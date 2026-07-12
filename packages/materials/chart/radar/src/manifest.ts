import { defineStandardMaterialManifest, recordSchemaAdapter } from '@easyink/core'
import { chartRadarAIMaterialDescriptor } from './ai'
import { CHART_RADAR_DATA_CONTRACT } from './data-contract'
import { createChartRadarExtension } from './designer'
import { chartRadarLocaleMessages } from './locale'
import { chartRadarDesignerPropSchemas } from './prop-schemas'
import { CHART_RADAR_TYPE, createChartRadarNode } from './schema'
import { renderChartRadar } from './viewer'

export const chartRadarMaterialManifest = defineStandardMaterialManifest({
  type: CHART_RADAR_TYPE,
  nameKey: 'materials.chartRadar.name',
  category: 'chart',
  iconKey: 'chart-radar',
  catalogOrder: 40,
  defaultNode: createChartRadarNode(),
  interaction: { rotatable: true, resizable: true },
  binding: { kind: 'ports', dataContract: CHART_RADAR_DATA_CONTRACT, ports: [{ id: 'data', key: { kind: 'exact', value: 'value' }, role: 'semantic', valueShape: 'record-array', formatEditor: false }] },
  layout: { intrinsicSize: 'none', fragmentation: 'none', pageRepeat: 'none', overflow: 'clip' },
  properties: chartRadarDesignerPropSchemas,
  schemaAdapter: recordSchemaAdapter(1),
  designerFactory: createChartRadarExtension,
  localeMessages: chartRadarLocaleMessages,
  viewerExtension: { render: renderChartRadar },
  viewerCapabilities: { sanitizedMarkup: true },
  aiDescriptor: chartRadarAIMaterialDescriptor,
  generation: { enabled: true, modelSchema: 'infer-from-default', bindingShape: 'infer-from-binding', examples: 'default-model', requiredModelPaths: ['/maxValue'] },
})
