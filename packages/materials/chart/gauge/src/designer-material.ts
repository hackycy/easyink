import type { DesignerMaterial } from '@easyink/plugin-api/ui'
import { IconChartGauge } from '@easyink/icons'
import { paletteGroups } from '@easyink/shared'
import { createChartGaugeExtension } from './designer'
import { chartGaugeLocaleMessages } from './locale'
import { chartGaugeModel } from './material-model'
import { chartGaugeDesignerPropSchemas } from './prop-schemas'

export const chartGauge: DesignerMaterial = {
  model: chartGaugeModel,
  renderer: createChartGaugeExtension,
  properties: chartGaugeDesignerPropSchemas,
  locale: chartGaugeLocaleMessages,
  ui: { palette: [{ id: 'chartGauge', label: 'materials.chartGauge.name', icon: IconChartGauge, group: paletteGroups.chart, order: 5 }] },
}
