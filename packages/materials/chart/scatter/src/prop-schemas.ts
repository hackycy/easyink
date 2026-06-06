import type { PropSchema } from '@easyink/core'

export const chartScatterDesignerPropSchemas: PropSchema[] = [
  { key: 'pointColor', label: 'materials.chartScatter.property.pointColor', type: 'color', group: 'appearance' },
  { key: 'backgroundColor', label: 'designer.property.background', type: 'color', group: 'appearance' },
  { key: 'axisColor', label: 'materials.chartScatter.property.axisColor', type: 'color', group: 'appearance' },
  { key: 'labelColor', label: 'materials.chartScatter.property.labelColor', type: 'color', group: 'appearance' },
  { key: 'showValueLabels', label: 'materials.chartScatter.property.showValueLabels', type: 'switch', group: 'content' },
  { key: 'showGrid', label: 'materials.chartScatter.property.showGrid', type: 'switch', group: 'content' },
  { key: 'showXAxisLabel', label: 'materials.chartScatter.property.showXAxisLabel', type: 'switch', group: 'content' },
  { key: 'showYAxisLabel', label: 'materials.chartScatter.property.showYAxisLabel', type: 'switch', group: 'content' },
  { key: 'showXAxisLine', label: 'materials.chartScatter.property.showXAxisLine', type: 'switch', group: 'content' },
  { key: 'showYAxisLine', label: 'materials.chartScatter.property.showYAxisLine', type: 'switch', group: 'content' },
  { key: 'symbolSize', label: 'materials.chartScatter.property.symbolSize', type: 'number', group: 'content', min: 2, max: 24, step: 1 },
]
