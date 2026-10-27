import type { DesignerMaterial } from '@easyink/plugin-api/ui'
import { IconChartScatter } from '@easyink/icons'
import { paletteGroups } from '@easyink/shared'
import { chartScatterAIMaterialDescriptor } from './ai'
import { createChartScatterExtension } from './designer'
import { chartScatterLocaleMessages } from './locale'
import { chartScatterModel } from './material-model'
import { chartScatterDesignerPropSchemas } from './prop-schemas'

export const chartScatter: DesignerMaterial = {
  model: chartScatterModel,
  renderer: createChartScatterExtension,
  properties: chartScatterDesignerPropSchemas,
  ai: chartScatterAIMaterialDescriptor,
  locale: chartScatterLocaleMessages,
  ui: { palette: [{ id: 'chartScatter', label: 'materials.chartScatter.name', icon: IconChartScatter, group: paletteGroups.chart, order: 4 }] },
}
