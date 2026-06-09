import type { AIMaterialDescriptor } from '@easyink/shared'

export const signatureAIMaterialDescriptor = {
  type: 'signature',
  description: 'Handwritten signature pad that stores internal stroke data and renders as SVG.',
  properties: ['backgroundColor', 'penColor'],
  requiredProps: ['backgroundColor', 'penColor'],
  binding: 'none',
  usage: [
    'Use for signature areas and handwritten approval fields.',
    'Do not bind signature to a data source; stroke data is material-internal.',
  ],
  knowledge: {
    category: 'data',
    composability: {
      canBeChildOf: ['*'],
      canContain: [],
      exclusiveWith: [],
      preferredCompanions: ['text', 'line'],
    },
    bindingSpec: {
      mode: 'none',
      accepts: { types: [], isArray: false },
      produces: { kind: 'none' },
    },
    sizing: { minWidth: 20, minHeight: 12, growAxis: 'none', defaultSize: { width: 80, height: 35 } },
    fitness: [
      { scenario: 'form', score: 0.9, reason: 'signature capture area' },
      { scenario: 'contract', score: 0.9, reason: 'approval signature block' },
      { scenario: 'receipt', score: 0.75, reason: 'customer signature field' },
    ],
  },
} satisfies AIMaterialDescriptor
