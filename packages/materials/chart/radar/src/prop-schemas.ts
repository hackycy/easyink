import type { PropertyDescriptor } from '@easyink/core'

export const chartRadarDesignerPropSchemas: PropertyDescriptor[] = [
  { key: 'areaColor', label: 'materials.chartRadar.property.areaColor', type: 'color', group: 'appearance' },
  { key: 'lineColor', label: 'materials.chartRadar.property.lineColor', type: 'color', group: 'appearance' },
  { key: 'pointColor', label: 'materials.chartRadar.property.pointColor', type: 'color', group: 'appearance' },
  { key: 'backgroundColor', label: 'designer.property.background', type: 'color', group: 'appearance' },
  { key: 'axisColor', label: 'materials.chartRadar.property.axisColor', type: 'color', group: 'appearance' },
  { key: 'labelColor', label: 'materials.chartRadar.property.labelColor', type: 'color', group: 'appearance' },
  { key: 'maxValue', label: 'materials.chartRadar.property.maxValue', type: 'number', group: 'content', min: 1, step: 1 },
  { key: 'showValueLabels', label: 'materials.chartRadar.property.showValueLabels', type: 'switch', group: 'content' },
  { key: 'showAxisLabels', label: 'materials.chartRadar.property.showAxisLabels', type: 'switch', group: 'content' },
  { key: 'showArea', label: 'materials.chartRadar.property.showArea', type: 'switch', group: 'content' },
  { key: 'showPoints', label: 'materials.chartRadar.property.showPoints', type: 'switch', group: 'content' },
]
