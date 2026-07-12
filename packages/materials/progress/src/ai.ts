import type { AIMaterialDescriptor } from '@easyink/shared'

export const progressAIMaterialDescriptor = {
  type: 'progress',
  description: 'Horizontal progress bar for a preset numeric percent or one bound scalar value.',
  properties: ['value', 'progressHeight', 'trackColor', 'progressColor', 'suffix', 'showText', 'textPosition', 'fontSize', 'fontFamily', 'fontWeight', 'fontStyle', 'color'],
  requiredProps: ['value', 'progressHeight', 'trackColor', 'progressColor', 'suffix', 'showText', 'textPosition'],
  bindings: 'single',
  usage: [
    'Use for horizontal completion, progress, utilization, score, or rate values.',
    'Bind one numeric field to value when runtime data should drive the progress; leave unbound to show the preset value.',
    'Only custom bindings.value formatting should be used for datasource formatting.',
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
        { scenario: 'task completion', bindings: { value: { sourceId: 'report', fieldPath: 'completionRate' } }, fieldStructure: { completionRate: 'number' } },
      ],
    },
    sizing: { minWidth: 20, minHeight: 6, growAxis: 'x', defaultSize: { width: 60, height: 12 } },
    fitness: [
      { scenario: 'dashboard', score: 0.9, reason: 'single horizontal progress KPI' },
      { scenario: 'report-summary', score: 0.85, reason: 'compact progress metric with readable label' },
      { scenario: 'certificate', score: 0.35, reason: 'rarely needed unless showing achievement progress' },
    ],
  },
} satisfies AIMaterialDescriptor
