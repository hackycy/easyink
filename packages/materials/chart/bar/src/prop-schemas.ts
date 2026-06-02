import type { PropSchema } from '@easyink/core'

export const chartBarDesignerPropSchemas: PropSchema[] = [
  { key: 'barColor', label: 'designer.property.barColor', type: 'color', group: 'appearance' },
  { key: 'backgroundColor', label: 'designer.property.background', type: 'color', group: 'appearance' },
  { key: 'axisColor', label: 'designer.property.axisColor', type: 'color', group: 'appearance' },
  { key: 'labelColor', label: 'designer.property.labelColor', type: 'color', group: 'appearance' },
  { key: 'showValueLabels', label: 'designer.property.showValueLabels', type: 'switch', group: 'content' },
  { key: 'showGrid', label: 'designer.property.showGrid', type: 'switch', group: 'content' },
  { key: 'showXAxisLabel', label: 'designer.property.showXAxisLabel', type: 'switch', group: 'content' },
  { key: 'showYAxisLabel', label: 'designer.property.showYAxisLabel', type: 'switch', group: 'content' },
  { key: 'showXAxisLine', label: 'designer.property.showXAxisLine', type: 'switch', group: 'content' },
  { key: 'showYAxisLine', label: 'designer.property.showYAxisLine', type: 'switch', group: 'content' },
]
