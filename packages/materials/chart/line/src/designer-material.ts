import type { DesignerMaterial } from '@easyink/plugin-api/ui'
import { IconChartLine } from '@easyink/icons'
import { paletteGroups } from '@easyink/shared'
import { chartLineAIMaterialDescriptor } from './ai'
import { createChartLineExtension } from './designer'
import { chartLineLocaleMessages } from './locale'
import { chartLineModel } from './material-model'
import { chartLineDesignerPropSchemas } from './prop-schemas'

export const chartLine: DesignerMaterial = {
  model: chartLineModel,
  renderer: createChartLineExtension,
  properties: chartLineDesignerPropSchemas,
  ai: chartLineAIMaterialDescriptor,
  locale: chartLineLocaleMessages,
  ui: { palette: [{ id: 'chartLine', label: 'materials.chartLine.name', icon: IconChartLine, group: paletteGroups.chart, order: 1 }] },
}
