import type { AIMaterialDescriptor } from '@easyink/shared'

export const chartBarAIMaterialDescriptor = {
  type: 'chart-bar',
  description: 'Simple bar chart for comparing numeric values from a material data contract: category field and value field, with the collection inferred from their shared parent path.',
  properties: ['barColor', 'backgroundColor', 'axisColor', 'labelColor', 'showValueLabels', 'showGrid', 'showXAxisLabel', 'showYAxisLabel', 'showXAxisLine', 'showYAxisLine'],
  requiredProps: ['barColor', 'backgroundColor'],
  binding: 'multi',
  usage: [
    'Use chart-bar for small report charts where categories compare numeric values.',
    'Prefer ordered multi-binding: bindIndex 0 is the category field and bindIndex 1 is the numeric value field.',
    'The runtime infers the collection path from the shared parent of the two field paths, for example monthlySales/month and monthlySales/revenue infer monthlySales.',
    'Do not require datasource fields to use chart-specific names such as label/value; chart-bar projects ordinary business fields into chart points.',
    'Legacy single binding to props.data is still accepted for old templates, but new templates should use ordered material data bindings.',
    'Designer preview uses built-in sample data only.',
    'Use showXAxisLabel/showYAxisLabel and showXAxisLine/showYAxisLine to hide axis labels or axis lines when a compact chart is needed.',
  ],
  schemaRules: [
    'Element type must be chart-bar.',
    'Props should only contain visual settings such as colors and simple display switches.',
    'Do not set props.data, props.options, or chartType on new chart-bar nodes.',
    'New chart-bar nodes should use two ordered field bindings: category field, value field.',
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
      produces: { kind: 'multi-field', fieldCount: 'multiple', pathPattern: '{collection}/{categoryField} + {collection}/{valueField}' },
      examples: [
        {
          scenario: 'monthly sales',
          binding: {
            slots: [
              { sourceId: 'report', fieldPath: 'monthlySales/month', bindIndex: 0 },
              { sourceId: 'report', fieldPath: 'monthlySales/revenue', bindIndex: 1 },
            ],
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
