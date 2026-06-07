import type { AIMaterialDescriptor } from '@easyink/shared'

export const chartCustomAIMaterialDescriptor = {
  type: 'chart-custom',
  description: 'Custom ECharts material for advanced chart option code or a bound option object/JSON string.',
  properties: ['optionMode', 'optionCode', 'option', 'backgroundColor'],
  requiredProps: ['optionMode'],
  binding: 'single',
  usage: [
    'Use chart-custom only when built-in chart materials cannot express the requested chart.',
    'Use props.optionMode = "code" and props.optionCode for trusted JavaScript that returns an ECharts option.',
    'Use ordinary binding to bind a datasource field that already returns an ECharts option object or JSON string.',
    'Do not use chart-custom for simple bar, line, pie, radar, scatter, or gauge charts when a dedicated material fits.',
  ],
  schemaRules: [
    'Element type must be chart-custom.',
    'Schema stores JavaScript source as props.optionCode, never function values.',
    'Ordinary binding maps the bound value to props.option.',
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
      mode: 'scalar',
      accepts: { types: ['object', 'string'], isArray: false },
      produces: { kind: 'scalar-field', fieldCount: 'single', pathPattern: '{fieldPath}' },
      examples: [
        {
          scenario: 'precomputed chart option',
          binding: { sourceId: 'report', fieldPath: 'echartsOption' },
          fieldStructure: { echartsOption: 'object' },
        },
      ],
    },
    sizing: { minWidth: 50, minHeight: 40, growAxis: 'none', defaultSize: { width: 160, height: 90 } },
    fitness: [
      { scenario: 'analytics-report', score: 0.85, reason: 'advanced chart options beyond built-in chart materials' },
      { scenario: 'dashboard', score: 0.85, reason: 'custom ECharts configuration for specialized visualizations' },
      { scenario: 'invoice-items', score: 0.15, reason: 'tables are better for line-item detail' },
      { scenario: 'receipt-items', score: 0.1, reason: 'too complex for narrow receipts' },
    ],
  },
} satisfies AIMaterialDescriptor
