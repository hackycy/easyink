import type { DesignerMaterial } from '@easyink/plugin-api/ui'
import { IconChartCustom } from '@easyink/icons'
import { paletteGroups } from '@easyink/shared'
import { chartCustomLocaleMessages } from './locale'
import { chartCustomModel } from './material-model'
import { chartCustomDesignerPropSchemas } from './prop-schemas'

export const chartCustom: DesignerMaterial = {
  model: chartCustomModel,
  loadRenderer: async () => (await import('./designer')).createChartCustomExtension,
  properties: chartCustomDesignerPropSchemas,
  locale: chartCustomLocaleMessages,
  ui: { palette: [{ id: 'chartCustom', label: 'materials.chartCustom.name', icon: IconChartCustom, group: paletteGroups.chart, order: 7 }] },
}
