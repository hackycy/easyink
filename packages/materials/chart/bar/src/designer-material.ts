import type { DesignerMaterial } from '@easyink/plugin-api/ui'
import { IconChartBar } from '@easyink/icons'
import { paletteGroups } from '@easyink/shared'
import { createChartBarExtension } from './designer'
import { chartBarLocaleMessages } from './locale'
import { chartBarModel } from './material-model'
import { chartBarDesignerPropSchemas } from './prop-schemas'

export const chartBar: DesignerMaterial = {
  model: chartBarModel,
  renderer: createChartBarExtension,
  properties: chartBarDesignerPropSchemas,
  locale: chartBarLocaleMessages,
  ui: { palette: [{ id: 'chartBar', label: 'materials.chartBar.name', icon: IconChartBar, group: paletteGroups.chart, order: 0 }] },
}
