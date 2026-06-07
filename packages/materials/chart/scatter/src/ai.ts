import type { AIMaterialDescriptor } from '@easyink/shared'

export const chartScatterAIMaterialDescriptor = {
  type: 'chart-scatter',
  description: 'Scatter chart for showing correlation or distribution between two numeric fields from a material data contract target model.',
  properties: ['pointColor', 'backgroundColor', 'axisColor', 'labelColor', 'showValueLabels', 'showGrid', 'showXAxisLabel', 'showYAxisLabel', 'showXAxisLine', 'showYAxisLine', 'symbolSize'],
  requiredProps: ['pointColor'],
  binding: 'data-contract',
  usage: [
    'Use chart-scatter when two numeric fields should be compared as X and Y coordinates.',
    'Use data-contract binding mappings: mappings.x selects the X numeric source path and mappings.y selects the Y numeric source path.',
    'Optional mappings.label can name points and mappings.color can override individual point colors.',
    'The resolver derives whether mappings share a record collection or should be aligned by index.',
    'Designer preview uses built-in sample data only.',
    'Use symbolSize for compact or prominent points.',
    'Use showXAxisLabel/showYAxisLabel and showXAxisLine/showYAxisLine to hide axis labels or axis lines when a compact chart is needed.',
  ],
  schemaRules: [
    'Element type must be chart-scatter.',
    'Props contain visual settings such as colors, point size, and simple display switches.',
    'Chart data should be described by binding.kind = "data-contract" with mappings for x and y, plus optional label and color mappings.',
  ],
  knowledge: {
    category: 'visualization',
    composability: {
      canBeChildOf: ['*'],
      canContain: [],
      exclusiveWith: [],
      preferredCompanions: ['text'],
    },
    bindingSpec: {
      mode: 'collection',
      accepts: { types: ['array'], isArray: true, minChildren: 2, requiredChildFields: ['x', 'y'] },
      produces: { kind: 'multi-field', fieldCount: 'multiple', pathPattern: 'mappings.x.select.path + mappings.y.select.path' },
      examples: [
        {
          scenario: 'quality correlation',
          binding: {
            kind: 'data-contract',
            mappings: {
              x: { sourceId: 'report', select: { path: 'measurements/temperature' } },
              y: { sourceId: 'report', select: { path: 'measurements/defectRate' } },
              label: { sourceId: 'report', select: { path: 'measurements/batch' } },
            },
            relation: { kind: 'auto' },
          },
          fieldStructure: { measurements: [{ batch: 'string', temperature: 'number', defectRate: 'number' }] },
        },
      ],
    },
    sizing: { minWidth: 50, minHeight: 40, growAxis: 'none', defaultSize: { width: 160, height: 90 } },
    fitness: [
      { scenario: 'analytics-report', score: 0.9, reason: 'good for showing numeric correlation or distribution' },
      { scenario: 'dashboard', score: 0.8, reason: 'useful for compact numeric comparisons in printable layouts' },
      { scenario: 'invoice-items', score: 0.15, reason: 'tables are better for line-item detail' },
      { scenario: 'receipt-items', score: 0.1, reason: 'too visual for narrow receipts' },
    ],
  },
} satisfies AIMaterialDescriptor
