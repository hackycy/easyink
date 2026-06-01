import type { AIMaterialDescriptor } from '@easyink/shared'

export const tableStaticAIMaterialDescriptor = {
  type: 'table-static',
  description: 'Fixed table for forms, headers, and non-repeating grid layouts.',
  properties: ['borderWidth', 'cellPadding', 'typography'],
  requiredProps: ['typography', 'borderWidth', 'cellPadding'],
  binding: 'multi',
  usage: [
    'Use table-static only when row count is fixed and not driven by an array.',
    'Cells use content.text for static labels or staticBinding for independent scalar fields.',
  ],
  schemaRules: [
    'Element must include table.kind = static.',
    'Element must include table.topology.columns and table.topology.rows.',
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
      mode: 'multi-scalar',
      accepts: { types: ['string', 'number', 'boolean', 'date'], isArray: false },
      produces: { kind: 'multi-field', fieldCount: 'multiple', pathPattern: '{fieldPath}' },
    },
    sizing: { minWidth: 30, minHeight: 10, growAxis: 'none', defaultSize: { width: 178, height: 40 } },
    fitness: [
      { scenario: 'form-grid', score: 0.95, reason: 'fixed-row key-value grids' },
      { scenario: 'invoice-header', score: 0.85, reason: 'structured header info with labels' },
      { scenario: 'summary-totals', score: 0.8, reason: 'fixed summary rows' },
      { scenario: 'h5-landing', score: 0.6, reason: 'specs or comparison grids on product pages' },
      { scenario: 'prototype', score: 0.75, reason: 'form layout and settings panels' },
      { scenario: 'certificate', score: 0.7, reason: 'structured certificate info fields' },
    ],
  },
} satisfies AIMaterialDescriptor
