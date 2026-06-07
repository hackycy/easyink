import type { AIMaterialDescriptor } from '@easyink/shared'

export const chartRadarAIMaterialDescriptor = {
  type: 'chart-radar',
  description: 'Simple radar chart for comparing multiple category scores from a material data contract target model: category field and value field mapped from source paths by relation resolver.',
  properties: ['areaColor', 'lineColor', 'pointColor', 'backgroundColor', 'axisColor', 'labelColor', 'showValueLabels', 'showAxisLabels', 'showArea', 'showPoints', 'maxValue'],
  requiredProps: ['lineColor'],
  binding: 'data-contract',
  usage: [
    'Use chart-radar for profile, scorecard, capability, or multi-metric comparisons where categories form axes around one polygon.',
    'Use data-contract binding mappings: mappings.category selects the radar axis label source path and mappings.value selects the numeric score source path.',
    'The resolver derives whether mappings share a record collection or should be aligned by index.',
    'Designer preview uses built-in sample data only.',
    'Use maxValue to set a consistent scale across comparable radar charts.',
    'Use showAxisLabels to hide the category labels around the radar when space is tight.',
    'Use showArea and showPoints to tune whether the chart should read as a filled profile or a precise outline.',
  ],
  schemaRules: [
    'Element type must be chart-radar.',
    'Props contain visual settings such as colors, maxValue, and simple display switches.',
    'Chart data should be described by binding.kind = "data-contract" with mappings for category and value.',
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
      accepts: { types: ['array'], isArray: true, minChildren: 3, requiredChildFields: ['category', 'value'] },
      produces: { kind: 'multi-field', fieldCount: 'multiple', pathPattern: 'mappings.category.select.path + mappings.value.select.path' },
      examples: [
        {
          scenario: 'capability scorecard',
          binding: {
            kind: 'data-contract',
            mappings: {
              category: { sourceId: 'report', select: { path: 'capabilities/name' } },
              value: { sourceId: 'report', select: { path: 'capabilities/score' } },
            },
            relation: { kind: 'auto' },
          },
          fieldStructure: { capabilities: [{ name: 'string', score: 'number' }] },
        },
      ],
    },
    sizing: { minWidth: 50, minHeight: 50, growAxis: 'none', defaultSize: { width: 120, height: 100 } },
    fitness: [
      { scenario: 'analytics-report', score: 0.82, reason: 'good for compact multi-metric score comparisons' },
      { scenario: 'dashboard', score: 0.78, reason: 'useful as a static score profile in printable layouts' },
      { scenario: 'invoice-items', score: 0.15, reason: 'tables are better for line-item detail' },
      { scenario: 'receipt-items', score: 0.1, reason: 'too visual for narrow receipts' },
    ],
  },
} satisfies AIMaterialDescriptor
