import type { PropertyDescriptor } from '@easyink/core'

export const chartGaugeDesignerPropSchemas: PropertyDescriptor[] = [
  { key: 'progressColor', label: 'materials.chartGauge.property.progressColor', type: 'color', group: 'appearance' },
  { key: 'trackColor', label: 'materials.chartGauge.property.trackColor', type: 'color', group: 'appearance' },
  { key: 'pointerColor', label: 'materials.chartGauge.property.pointerColor', type: 'color', group: 'appearance' },
  { key: 'backgroundColor', label: 'designer.property.background', type: 'color', group: 'appearance' },
  { key: 'labelColor', label: 'materials.chartGauge.property.labelColor', type: 'color', group: 'appearance' },
  { key: 'minValue', label: 'materials.chartGauge.property.minValue', type: 'number', group: 'content', step: 1 },
  { key: 'maxValue', label: 'materials.chartGauge.property.maxValue', type: 'number', group: 'content', step: 1 },
  { key: 'defaultName', label: 'materials.chartGauge.property.defaultName', type: 'string', group: 'content' },
  { key: 'defaultUnit', label: 'materials.chartGauge.property.defaultUnit', type: 'string', group: 'content' },
  { key: 'showPointer', label: 'materials.chartGauge.property.showPointer', type: 'switch', group: 'content' },
  { key: 'showProgress', label: 'materials.chartGauge.property.showProgress', type: 'switch', group: 'content' },
  { key: 'showTitle', label: 'materials.chartGauge.property.showTitle', type: 'switch', group: 'content' },
  { key: 'showValue', label: 'materials.chartGauge.property.showValue', type: 'switch', group: 'content' },
]
