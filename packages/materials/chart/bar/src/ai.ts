import type { AIMaterialDescriptor } from '@easyink/shared'

export const chartBarAIMaterialDescriptor = {
  type: 'chart-bar',
  description: 'Simple bar chart for comparing numeric values from a bound datasource array or key-value object.',
  properties: ['barColor', 'backgroundColor', 'axisColor', 'labelColor', 'showValueLabels', 'showGrid', 'showXAxisLabel', 'showYAxisLabel', 'showXAxisLine', 'showYAxisLine'],
  requiredProps: ['barColor', 'backgroundColor'],
  binding: 'single',
  usage: [
    'Use chart-bar for small report charts where categories compare numeric values.',
    'Bind the whole material to datasource data; do not store chart datasets in props.',
    'Accepted runtime data can be an array of { label, value } records, an array of numbers, { categories, values }, or a numeric key-value object.',
    'Designer preview uses built-in sample data only.',
    'Use showXAxisLabel/showYAxisLabel and showXAxisLine/showYAxisLine to hide axis labels or axis lines when a compact chart is needed.',
  ],
  schemaRules: [
    'Element type must be chart-bar.',
    'Props should only contain visual settings such as colors and simple display switches.',
    'Do not set props.data, props.options, or chartType on chart-bar nodes.',
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
      accepts: { types: ['array', 'object'], minChildren: 1 },
      produces: { kind: 'multi-field', fieldCount: 'dynamic', pathPattern: '{collection}' },
      examples: [
        { scenario: 'monthly sales', binding: { sourceId: 'report', fieldPath: 'monthlySales' }, fieldStructure: { monthlySales: [{ label: 'Jan', value: 120 }] } },
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
