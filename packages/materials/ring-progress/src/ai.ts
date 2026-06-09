import type { AIMaterialDescriptor } from '@easyink/shared'

export const ringProgressAIMaterialDescriptor = {
  type: 'ring-progress',
  description: 'Circular progress indicator for a preset numeric percent or one bound scalar value.',
  properties: ['value', 'progressWidth', 'trackColor', 'progressColor', 'suffix', 'showText', 'fontSize', 'fontFamily', 'fontWeight', 'fontStyle', 'color'],
  requiredProps: ['value', 'progressWidth', 'trackColor', 'progressColor', 'suffix', 'showText'],
  binding: 'single',
  usage: [
    'Use for single KPI completion, progress, utilization, score, or rate values.',
    'Bind one numeric field to value when runtime data should drive the progress; leave unbound to show the preset value.',
    'Only custom binding formatting should be used for datasource formatting.',
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
        { scenario: 'completion rate', binding: { sourceId: 'report', fieldPath: 'completionRate' }, fieldStructure: { completionRate: 'number' } },
      ],
    },
    sizing: { minWidth: 12, minHeight: 12, aspectRatio: 1, growAxis: 'none', defaultSize: { width: 36, height: 36 } },
    fitness: [
      { scenario: 'dashboard', score: 0.9, reason: 'single progress KPI' },
      { scenario: 'report-summary', score: 0.8, reason: 'compact completion metric' },
      { scenario: 'certificate', score: 0.4, reason: 'rarely needed unless showing achievement progress' },
    ],
  },
} satisfies AIMaterialDescriptor
