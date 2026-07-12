import type { AIMaterialDescriptor } from '@easyink/shared'

export const chartLineAIMaterialDescriptor = {
  type: 'chart-line',
  description: 'Simple line chart for showing numeric trends from a material data contract target model: category field and value field mapped from source paths by relation resolver.',
  properties: ['lineColor', 'pointColor', 'backgroundColor', 'axisColor', 'labelColor', 'showValueLabels', 'showGrid', 'showXAxisLabel', 'showYAxisLabel', 'showXAxisLine', 'showYAxisLine', 'showPoints', 'smooth'],
  requiredProps: ['lineColor'],
  bindings: 'data-contract',
  usage: [
    'Use chart-line for small report charts where ordered categories show a numeric trend.',
    'Use bindings.value data-contract mappings: mappings.category selects the category source path and mappings.value selects the numeric value source path.',
    'The resolver derives whether mappings share a record collection or should be aligned by index.',
    'Chart-line projects ordinary business fields into ordered chart points.',
    'Designer preview uses built-in sample data only.',
    'Use showPoints and smooth to tune whether the trend should look precise or softened.',
    'Use showXAxisLabel/showYAxisLabel and showXAxisLine/showYAxisLine to hide axis labels or axis lines when a compact chart is needed.',
  ],
  schemaRules: [
    'Element type must be chart-line.',
    'Model contains visual settings such as colors and simple display switches.',
    'Chart data uses the canonical bindings.value semantic port with category and value mappings.',
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
      accepts: { types: ['array'], isArray: true, minChildren: 2, requiredChildFields: ['category', 'value'] },
      produces: { kind: 'multi-field', fieldCount: 'multiple', pathPattern: 'mappings.category.select.path + mappings.value.select.path' },
      examples: [
        {
          scenario: 'monthly trend',
          bindings: {
            value: {
              kind: 'data-contract',
              mappings: {
                category: { sourceId: 'report', select: { path: 'monthlySales/month' } },
                value: { sourceId: 'report', select: { path: 'monthlySales/revenue' } },
              },
              relation: { kind: 'auto' },
            },
          },
          fieldStructure: { monthlySales: [{ month: 'string', revenue: 'number' }] },
        },
      ],
    },
    sizing: { minWidth: 50, minHeight: 40, growAxis: 'none', defaultSize: { width: 160, height: 90 } },
    fitness: [
      { scenario: 'analytics-report', score: 0.9, reason: 'good for compact categorical trend lines' },
      { scenario: 'dashboard', score: 0.85, reason: 'simple static trend chart in printable layouts' },
      { scenario: 'invoice-items', score: 0.2, reason: 'tables are better for line-item detail' },
      { scenario: 'receipt-items', score: 0.1, reason: 'too visual for narrow receipts' },
    ],
  },
} satisfies AIMaterialDescriptor
