import type { AIMaterialDescriptor } from '@easyink/shared'

export const rectAIMaterialDescriptor = {
  type: 'rect',
  description: 'Rectangle shape for borders, backgrounds, frames, and simple visual blocks.',
  properties: ['fillColor', 'borderWidth', 'borderColor', 'borderType', 'borderRadius'],
  requiredProps: ['fillColor', 'borderWidth', 'borderColor', 'borderType'],
  binding: 'none',
  usage: [
    'Use fillColor and borderColor; do not use legacy fill or stroke props.',
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
    sizing: { minWidth: 5, minHeight: 5, growAxis: 'none', defaultSize: { width: 30, height: 20 } },
    fitness: [
      { scenario: 'background-frame', score: 0.7, reason: 'decorative background' },
    ],
  },
} satisfies AIMaterialDescriptor
