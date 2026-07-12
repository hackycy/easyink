import { defineStandardMaterialManifest, recordSchemaAdapter } from '@easyink/core'
import { chartCustomAIMaterialDescriptor } from './ai'
import { createChartCustomExtension } from './designer'
import { chartCustomLocaleMessages } from './locale'
import { chartCustomDesignerPropSchemas } from './prop-schemas'
import { CHART_CUSTOM_TYPE, createChartCustomNode } from './schema'
import { renderChartCustom } from './viewer'

export const chartCustomMaterialManifest = defineStandardMaterialManifest({
  type: CHART_CUSTOM_TYPE,
  nameKey: 'materials.chartCustom.name',
  category: 'chart',
  iconKey: 'chart-custom',
  catalogOrder: 70,
  defaultNode: createChartCustomNode(),
  interaction: { rotatable: true, resizable: true },
  binding: { kind: 'ports', ports: [{ id: 'option', key: { kind: 'exact', value: 'value' }, role: 'display', valueShape: 'json', modelPath: '/model/option', formatEditor: { tabs: ['preset'] } }] },
  layout: { intrinsicSize: 'none', fragmentation: 'none', pageRepeat: 'none', overflow: 'clip' },
  properties: chartCustomDesignerPropSchemas,
  schemaAdapter: recordSchemaAdapter(1),
  designerFactory: createChartCustomExtension,
  localeMessages: chartCustomLocaleMessages,
  viewerExtension: { render: renderChartCustom },
  viewerCapabilities: { sanitizedMarkup: true },
  aiDescriptor: chartCustomAIMaterialDescriptor,
  modelSchema: {
    type: 'object',
    required: ['optionCode', 'option', 'backgroundColor'],
    properties: {
      optionCode: { type: 'string' },
      option: {},
      backgroundColor: { type: 'string' },
    },
    additionalProperties: false,
  },
})
