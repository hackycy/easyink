import type { PropertyDescriptor } from '@easyink/core'
import { CHART_PIE_PALETTE_OPTIONS } from './options'

export const chartPieDesignerPropSchemas: PropertyDescriptor[] = [
  {
    key: 'palettePreset',
    label: 'materials.chartPie.property.palettePreset',
    type: 'enum',
    group: 'appearance',
    enum: CHART_PIE_PALETTE_OPTIONS,
  },
  { key: 'backgroundColor', label: 'designer.property.background', type: 'color', group: 'appearance' },
  { key: 'labelColor', label: 'materials.chartPie.property.labelColor', type: 'color', group: 'appearance' },
  { key: 'innerRadiusPercent', label: 'materials.chartPie.property.innerRadiusPercent', type: 'number', group: 'content', min: 0, max: 80, step: 1 },
  { key: 'sectorGapAngle', label: 'materials.chartPie.property.sectorGapAngle', type: 'number', group: 'content', min: 0, max: 20, step: 1 },
  { key: 'sectorCornerRadius', label: 'materials.chartPie.property.sectorCornerRadius', type: 'number', group: 'content', min: 0, max: 20, step: 1 },
  { key: 'showValueLabels', label: 'materials.chartPie.property.showValueLabels', type: 'switch', group: 'content' },
  { key: 'showLegend', label: 'materials.chartPie.property.showLegend', type: 'switch', group: 'content' },
]
