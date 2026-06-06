import type { PropSchema } from '@easyink/core'

export const chartPieDesignerPropSchemas: PropSchema[] = [
  {
    key: 'palettePreset',
    label: 'materials.chartPie.property.palettePreset',
    type: 'enum',
    group: 'appearance',
    enum: [
      { label: 'materials.chartPie.option.paletteClassic', value: 'classic' },
      { label: 'materials.chartPie.option.paletteBusiness', value: 'business' },
      { label: 'materials.chartPie.option.palettePastel', value: 'pastel' },
    ],
  },
  { key: 'backgroundColor', label: 'designer.property.background', type: 'color', group: 'appearance' },
  { key: 'labelColor', label: 'materials.chartPie.property.labelColor', type: 'color', group: 'appearance' },
  { key: 'innerRadiusPercent', label: 'materials.chartPie.property.innerRadiusPercent', type: 'number', group: 'content', min: 0, max: 80, step: 1 },
  { key: 'showValueLabels', label: 'materials.chartPie.property.showValueLabels', type: 'switch', group: 'content' },
  { key: 'showLegend', label: 'materials.chartPie.property.showLegend', type: 'switch', group: 'content' },
]
