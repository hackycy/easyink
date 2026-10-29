import type { DesignerMaterial } from '@easyink/plugin-api/ui'
import { IconChartRadar } from '@easyink/icons'
import { paletteGroups } from '@easyink/shared'
import { createChartRadarExtension } from './designer'
import { chartRadarLocaleMessages } from './locale'
import { chartRadarModel } from './material-model'
import { chartRadarDesignerPropSchemas } from './prop-schemas'

export const chartRadar: DesignerMaterial = {
  model: chartRadarModel,
  renderer: createChartRadarExtension,
  properties: chartRadarDesignerPropSchemas,
  locale: chartRadarLocaleMessages,
  ui: { palette: [{ id: 'chartRadar', label: 'materials.chartRadar.name', icon: IconChartRadar, group: paletteGroups.chart, order: 3 }] },
}
