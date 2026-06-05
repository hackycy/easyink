import type { PropSchema } from '@easyink/core'

export const chartBarDesignerPropSchemas: PropSchema[] = [
  { key: 'barColor', label: 'materials.chartBar.property.barColor', type: 'color', group: 'appearance' },
  { key: 'backgroundColor', label: 'designer.property.background', type: 'color', group: 'appearance' },
  { key: 'axisColor', label: 'materials.chartBar.property.axisColor', type: 'color', group: 'appearance' },
  { key: 'labelColor', label: 'materials.chartBar.property.labelColor', type: 'color', group: 'appearance' },
  { key: 'showValueLabels', label: 'materials.chartBar.property.showValueLabels', type: 'switch', group: 'content' },
  { key: 'showGrid', label: 'materials.chartBar.property.showGrid', type: 'switch', group: 'content' },
  { key: 'showXAxisLabel', label: 'materials.chartBar.property.showXAxisLabel', type: 'switch', group: 'content' },
  { key: 'showYAxisLabel', label: 'materials.chartBar.property.showYAxisLabel', type: 'switch', group: 'content' },
  { key: 'showXAxisLine', label: 'materials.chartBar.property.showXAxisLine', type: 'switch', group: 'content' },
  { key: 'showYAxisLine', label: 'materials.chartBar.property.showYAxisLine', type: 'switch', group: 'content' },
]
