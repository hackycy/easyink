import type { AIMaterialDescriptor } from '@easyink/shared'

export const chartAIMaterialDescriptor = {
  type: 'chart',
  description: 'Chart visualization for report templates with numeric series data.',
  properties: ['chartType', 'data', 'options', 'backgroundColor'],
  requiredProps: ['chartType', 'data', 'options'],
  binding: 'multi',
  usage: [
    'Use only for analytic reports; do not use for receipts, invoices, labels, or plain tables.',
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
      accepts: { types: ['array'], isArray: true, minChildren: 2, requiredChildFields: ['label', 'value'] },
      produces: { kind: 'collection-repeat', fieldCount: 'dynamic', pathPattern: '{collection}/{field}' },
    },
    sizing: { minWidth: 50, minHeight: 40, growAxis: 'none', defaultSize: { width: 150, height: 100 } },
    fitness: [
      { scenario: 'analytics-report', score: 0.95, reason: 'primary choice for data visualization' },
      { scenario: 'dashboard', score: 0.9, reason: 'visual data representation' },
      { scenario: 'h5-landing', score: 0.7, reason: 'data-driven promotional charts' },
      { scenario: 'poster', score: 0.6, reason: 'infographic data visualization' },
    ],
  },
} satisfies AIMaterialDescriptor
