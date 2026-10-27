import type { DesignerMaterial } from '@easyink/plugin-api/ui'
import { IconChartPie } from '@easyink/icons'
import { paletteGroups } from '@easyink/shared'
import { chartPieAIMaterialDescriptor } from './ai'
import { createChartPieExtension } from './designer'
import { chartPieLocaleMessages } from './locale'
import { chartPieModel } from './material-model'
import { chartPieDesignerPropSchemas } from './prop-schemas'

export const chartPie: DesignerMaterial = {
  model: chartPieModel,
  renderer: createChartPieExtension,
  properties: chartPieDesignerPropSchemas,
  ai: chartPieAIMaterialDescriptor,
  locale: chartPieLocaleMessages,
  ui: { palette: [{ id: 'chartPie', label: 'materials.chartPie.name', icon: IconChartPie, group: paletteGroups.chart, order: 2 }] },
}
