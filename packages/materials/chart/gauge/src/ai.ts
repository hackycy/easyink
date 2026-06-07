import type { AIMaterialDescriptor } from '@easyink/shared'

export const chartGaugeAIMaterialDescriptor = {
  type: 'chart-gauge',
  description: 'Single-value gauge chart for showing progress, score, completion, utilization, or other KPI values from a material data contract target model: required value field plus optional name, unit, and color fields mapped from source paths.',
  properties: ['minValue', 'maxValue', 'defaultName', 'defaultUnit', 'progressColor', 'trackColor', 'pointerColor', 'backgroundColor', 'labelColor', 'showPointer', 'showProgress', 'showTitle', 'showValue'],
  requiredProps: ['minValue', 'maxValue'],
  binding: 'data-contract',
  usage: [
    'Use chart-gauge for one current KPI value such as completion rate, quality score, utilization, SLA progress, or quota attainment.',
    'Use data-contract binding mappings: mappings.value selects the numeric source path.',
    'Use optional mappings.name to override the title, mappings.unit to override the unit suffix, and mappings.color to override the progress color with a safe CSS color.',
    'Scalar numeric fields are accepted for single KPI values; collection bindings use the first valid resolved record.',
    'Set minValue and maxValue to the meaningful gauge domain, commonly 0 and 100 for percentages.',
    'Designer preview uses built-in sample data only.',
    'Use showPointer, showProgress, showTitle, and showValue to simplify compact charts.',
  ],
  schemaRules: [
    'Element type must be chart-gauge.',
    'Props contain visual settings such as minValue, maxValue, defaultName, defaultUnit, colors, and visibility toggles.',
    'Chart data should be described by binding.kind = "data-contract" with a required value mapping and optional name, unit, and color mappings.',
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
      accepts: { types: ['number', 'object', 'array'], isArray: false, requiredChildFields: ['value'] },
      produces: { kind: 'multi-field', fieldCount: 'single', pathPattern: 'mappings.value.select.path + optional mappings.name.select.path + optional mappings.unit.select.path + optional mappings.color.select.path' },
      examples: [
        {
          scenario: 'completion KPI',
          binding: {
            kind: 'data-contract',
            mappings: {
              value: { sourceId: 'report', select: { path: 'metrics/completion' } },
              name: { sourceId: 'report', select: { path: 'metrics/title' } },
              unit: { sourceId: 'report', select: { path: 'metrics/unit' } },
              color: { sourceId: 'report', select: { path: 'metrics/color' } },
            },
            relation: { kind: 'auto' },
          },
          fieldStructure: { metrics: { completion: 'number', title: 'string', unit: 'string', color: 'string' } },
        },
      ],
    },
    sizing: { minWidth: 60, minHeight: 45, growAxis: 'none', defaultSize: { width: 130, height: 90 } },
    fitness: [
      { scenario: 'analytics-report', score: 0.85, reason: 'good for highlighting a single bounded KPI' },
      { scenario: 'dashboard', score: 0.9, reason: 'well suited to compact status and progress summaries' },
      { scenario: 'invoice-items', score: 0.15, reason: 'tables are better for line-item detail' },
      { scenario: 'receipt-items', score: 0.1, reason: 'too visual for narrow receipts' },
    ],
  },
} satisfies AIMaterialDescriptor
