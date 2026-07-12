import type { PropertyDescriptor } from '@easyink/core'

export const chartLineDesignerPropSchemas: PropertyDescriptor[] = [
  { key: 'lineColor', label: 'materials.chartLine.property.lineColor', type: 'color', group: 'appearance' },
  { key: 'pointColor', label: 'materials.chartLine.property.pointColor', type: 'color', group: 'appearance' },
  { key: 'backgroundColor', label: 'designer.property.background', type: 'color', group: 'appearance' },
  { key: 'axisColor', label: 'materials.chartLine.property.axisColor', type: 'color', group: 'appearance' },
  { key: 'labelColor', label: 'materials.chartLine.property.labelColor', type: 'color', group: 'appearance' },
  { key: 'showValueLabels', label: 'materials.chartLine.property.showValueLabels', type: 'switch', group: 'content' },
  { key: 'showGrid', label: 'materials.chartLine.property.showGrid', type: 'switch', group: 'content' },
  { key: 'showXAxisLabel', label: 'materials.chartLine.property.showXAxisLabel', type: 'switch', group: 'content' },
  { key: 'showYAxisLabel', label: 'materials.chartLine.property.showYAxisLabel', type: 'switch', group: 'content' },
  { key: 'showXAxisLine', label: 'materials.chartLine.property.showXAxisLine', type: 'switch', group: 'content' },
  { key: 'showYAxisLine', label: 'materials.chartLine.property.showYAxisLine', type: 'switch', group: 'content' },
  { key: 'showPoints', label: 'materials.chartLine.property.showPoints', type: 'switch', group: 'content' },
  { key: 'smooth', label: 'materials.chartLine.property.smooth', type: 'switch', group: 'content' },
]
