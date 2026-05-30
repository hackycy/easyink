import type { AIMaterialDescriptor } from '@easyink/shared'

export const lineAIMaterialDescriptor = {
  type: 'line',
  description: 'Straight separator line. The element width and height define line length and thickness.',
  properties: ['lineColor', 'lineType'],
  requiredProps: ['lineColor', 'lineType'],
  binding: 'none',
  usage: [
    'Use for receipt separators, section rules, and simple borders.',
    'Do not use legacy stroke, strokeWidth, x1, y1, x2, or y2 props.',
  ],
  knowledge: {
    category: 'decoration',
    composability: {
      canBeChildOf: ['container', '*'],
      canContain: [],
      exclusiveWith: [],
      preferredCompanions: ['text'],
    },
    bindingSpec: {
      mode: 'none',
      accepts: { types: [], isArray: false },
      produces: { kind: 'none' },
    },
    sizing: { minWidth: 5, minHeight: 0.3, growAxis: 'none', defaultSize: { width: 60, height: 0.5 } },
    fitness: [
      { scenario: 'receipt-separator', score: 0.95, reason: 'section divider line' },
      { scenario: 'invoice-separator', score: 0.8, reason: 'horizontal rule between sections' },
    ],
  },
} satisfies AIMaterialDescriptor
