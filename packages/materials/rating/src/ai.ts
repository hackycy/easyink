import type { AIMaterialDescriptor } from '@easyink/shared'

export const ratingAIMaterialDescriptor = {
  type: 'rating',
  description: 'Character-based rating material for a preset 0-100 score or one bound scalar value.',
  properties: ['value', 'character', 'characterCount', 'characterSize', 'activeColor', 'backgroundColor'],
  requiredProps: ['value', 'character', 'characterCount', 'characterSize', 'activeColor', 'backgroundColor'],
  binding: 'single',
  usage: [
    'Use for rating, score, satisfaction, quality, or star-style scalar evaluations.',
    'Bind one numeric field to value when runtime data should drive the rating; leave unbound to show the preset value.',
    'The value is always interpreted as 0 to 100 and converted proportionally across the configured character count.',
  ],
  knowledge: {
    category: 'data',
    composability: {
      canBeChildOf: ['*'],
      canContain: [],
      exclusiveWith: [],
      preferredCompanions: ['text'],
    },
    bindingSpec: {
      mode: 'scalar',
      accepts: { types: ['number', 'string'], isArray: false },
      produces: { kind: 'scalar-field', fieldCount: 'single', pathPattern: '{fieldPath}' },
      examples: [
        { scenario: 'customer satisfaction score', binding: { sourceId: 'survey', fieldPath: 'satisfactionScore' }, fieldStructure: { satisfactionScore: 'number' } },
      ],
    },
    sizing: { minWidth: 12, minHeight: 4, growAxis: 'x', defaultSize: { width: 36, height: 8 } },
    fitness: [
      { scenario: 'scorecard', score: 0.9, reason: 'compact visual score indicator' },
      { scenario: 'inspection-report', score: 0.85, reason: 'quality or satisfaction rating display' },
      { scenario: 'freeform-document', score: 0.45, reason: 'use only when a scalar rating is meaningful' },
    ],
  },
} satisfies AIMaterialDescriptor
