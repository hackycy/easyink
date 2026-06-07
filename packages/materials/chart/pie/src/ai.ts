import type { AIMaterialDescriptor } from '@easyink/shared'

export const chartPieAIMaterialDescriptor = {
  type: 'chart-pie',
  description: 'Simple pie chart for showing how category values contribute to a whole from a material data contract target model: category field, value field, and optional per-record color field mapped from source paths by relation resolver.',
  properties: ['palettePreset', 'backgroundColor', 'labelColor', 'showValueLabels', 'showLegend', 'innerRadiusPercent', 'sectorGapAngle', 'sectorCornerRadius'],
  requiredProps: ['palettePreset'],
  binding: 'data-contract',
  usage: [
    'Use chart-pie for compact share-of-total visualizations where categories add up to a meaningful whole.',
    'Use data-contract binding mappings: mappings.category selects the category source path and mappings.value selects the numeric value source path.',
    'Use optional mappings.color when source data carries a per-slice CSS color such as #2f80ed; otherwise chart-pie uses the selected system palette.',
    'The resolver derives whether mappings share a record collection or should be aligned by index.',
    'Choose palettePreset from classic, business, or pastel for system-managed colors.',
    'Use innerRadiusPercent greater than 0 for a donut chart.',
    'Use sectorGapAngle greater than 0 to add visual spacing between pie slices.',
    'Use sectorCornerRadius greater than 0 to round pie slice corners.',
    'Designer preview uses built-in sample data only.',
    'Use showLegend or showValueLabels to reduce clutter in compact charts.',
  ],
  schemaRules: [
    'Element type must be chart-pie.',
    'Props contain visual settings such as palettePreset, labels, legend display, inner radius, slice gap angle, and slice corner radius.',
    'Chart data should be described by binding.kind = "data-contract" with mappings for category and value, and optional color.',
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
      accepts: { types: ['array'], isArray: true, minChildren: 2, requiredChildFields: ['category', 'value'] },
      produces: { kind: 'multi-field', fieldCount: 'multiple', pathPattern: 'mappings.category.select.path + mappings.value.select.path + optional mappings.color.select.path' },
      examples: [
        {
          scenario: 'expense split',
          binding: {
            kind: 'data-contract',
            mappings: {
              category: { sourceId: 'report', select: { path: 'expenses/type' } },
              value: { sourceId: 'report', select: { path: 'expenses/amount' } },
              color: { sourceId: 'report', select: { path: 'expenses/color' } },
            },
            relation: { kind: 'auto' },
          },
          fieldStructure: { expenses: [{ type: 'string', amount: 'number', color: 'string' }] },
        },
      ],
    },
    sizing: { minWidth: 50, minHeight: 50, growAxis: 'none', defaultSize: { width: 120, height: 100 } },
    fitness: [
      { scenario: 'analytics-report', score: 0.85, reason: 'good for showing share of total across categories' },
      { scenario: 'dashboard', score: 0.8, reason: 'simple static proportional chart in printable layouts' },
      { scenario: 'invoice-items', score: 0.2, reason: 'tables are better for line-item detail' },
      { scenario: 'receipt-items', score: 0.1, reason: 'too visual for narrow receipts' },
    ],
  },
} satisfies AIMaterialDescriptor
