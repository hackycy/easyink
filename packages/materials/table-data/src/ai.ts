import type { AIMaterialDescriptor } from '@easyink/shared'

export const tableDataAIMaterialDescriptor = {
  type: 'table-data',
  description: 'Dynamic data table for arrays such as receipt items, invoice lines, and order details.',
  properties: ['headerBackground', 'summaryBackground', 'stripedRows', 'stripedColor', 'borderWidth', 'cellPadding', 'typography'],
  requiredProps: ['typography', 'borderWidth', 'cellPadding'],
  binding: 'multi',
  usage: [
    'Use table-data whenever the template has an array/detail-list field.',
    'The data content area is defined by one repeat-template row. At runtime that single row expands into N records from the bound array.',
    'Header cells use content.text. Repeat-template cells use binding with absolute slash-separated paths such as items/name.',
    'In the designer, EasyInk may render two virtual preview rows after the repeat-template row to preview the data area. Those preview rows are display-only, share the element height with the real rows, and must not be encoded as extra schema rows.',
    'Do not use legacy type table, props.columns, props.repeatTemplate, headerStyle, rowStyle, or borderStyle.',
  ],
  schemaRules: [
    'Element must include table.kind = data.',
    'Element must include table.topology.columns as normalized ratios that sum to 1.',
    'Element must include table.topology.rows with a header row and a repeat-template row for array data.',
    'Element height is the full semantic table box in the designer; virtual preview rows stay inside that height instead of extending the outer frame.',
    'Element must keep the preview semantics in the renderer only: table.topology.rows stores the real structural rows, not duplicated sample rows.',
    'Element must include table.layout with borderAppearance, borderWidth, borderType, and borderColor.',
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
      mode: 'collection',
      accepts: { types: ['array'], isArray: true, minChildren: 1 },
      produces: { kind: 'collection-repeat', fieldCount: 'dynamic', pathPattern: '{collection}/{field}' },
      examples: [
        { scenario: 'invoice line items', binding: { sourceId: 'invoice', fieldPath: 'items/name' }, fieldStructure: { items: [{ name: 'string', quantity: 'number', price: 'number' }] } },
      ],
    },
    sizing: { minWidth: 30, minHeight: 15, growAxis: 'y', defaultSize: { width: 178, height: 80 } },
    fitness: [
      { scenario: 'invoice-items', score: 0.95, reason: 'primary choice for array/detail-list data' },
      { scenario: 'order-details', score: 0.95, reason: 'tabular array data with headers' },
      { scenario: 'receipt-items', score: 0.7, reason: 'works but flow-row may be better for narrow receipts' },
      { scenario: 'report-table', score: 0.9, reason: 'structured data display' },
      { scenario: 'h5-landing', score: 0.7, reason: 'product list or pricing table' },
      { scenario: 'prototype', score: 0.8, reason: 'data table UI component' },
    ],
  },
} satisfies AIMaterialDescriptor
