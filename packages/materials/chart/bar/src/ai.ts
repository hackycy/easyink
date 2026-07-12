import type { AIMaterialDescriptor } from '@easyink/shared'

export const chartBarAIMaterialDescriptor = {
  type: 'chart-bar',
  description: 'Simple bar chart for comparing numeric values from a material data contract target model: category field and value field mapped from source paths by relation resolver.',
  properties: ['barColor', 'backgroundColor', 'axisColor', 'labelColor', 'showValueLabels', 'showGrid', 'showXAxisLabel', 'showYAxisLabel', 'showXAxisLine', 'showYAxisLine'],
  requiredProps: ['barColor'],
  binding: 'data-contract',
  usage: [
    'Use chart-bar for small report charts where categories compare numeric values.',
    'Use data-contract binding mappings: mappings.category selects the category source path and mappings.value selects the numeric value source path.',
    'The resolver derives whether mappings share a record collection or should be aligned by index.',
    'Chart-bar projects ordinary business fields into chart points.',
    'Designer preview uses built-in sample data only.',
    'Use showXAxisLabel/showYAxisLabel and showXAxisLine/showYAxisLine to hide axis labels or axis lines when a compact chart is needed.',
  ],
  schemaRules: [
    'Element type must be chart-bar.',
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
          scenario: 'monthly sales',
          binding: {
            kind: 'data-contract',
            mappings: {
              category: { sourceId: 'report', select: { path: 'monthlySales/month' } },
              value: { sourceId: 'report', select: { path: 'monthlySales/revenue' } },
            },
            relation: { kind: 'auto' },
          },
          fieldStructure: { monthlySales: [{ month: 'string', revenue: 'number' }] },
        },
      ],
    },
    sizing: { minWidth: 50, minHeight: 40, growAxis: 'none', defaultSize: { width: 160, height: 90 } },
    fitness: [
      { scenario: 'analytics-report', score: 0.9, reason: 'good for compact categorical numeric comparisons' },
      { scenario: 'dashboard', score: 0.85, reason: 'simple static chart in printable layouts' },
      { scenario: 'invoice-items', score: 0.2, reason: 'tables are better for line-item detail' },
      { scenario: 'receipt-items', score: 0.1, reason: 'too visual for narrow receipts' },
    ],
  },
} satisfies AIMaterialDescriptor
