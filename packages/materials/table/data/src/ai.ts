import type { AIMaterialDescriptor } from '@easyink/shared'

export const tableDataAIMaterialDescriptor = {
  type: 'table-data',
  description: 'Dynamic data table for arrays such as receipt items, invoice lines, and order details. Composed of header row (column titles), a single repeat-template row (expands to N records at runtime), and an optional footer row (summaries/totals).',
  properties: ['headerBackground', 'summaryBackground', 'borderWidth', 'cellPadding', 'typography'],
  requiredProps: ['typography', 'borderWidth', 'cellPadding'],
  binding: 'multi',
  usage: [
    'Use table-data whenever the template has an array/detail-list field.',
    'The table has three structural row roles: header (static column titles), repeat-template (one row that expands into N data records at runtime), and footer (static summary/totals).',
    'Header and footer rows use content.text for static labels or staticBinding for independent scalar fields.',
    'Repeat-template row cells use binding with absolute slash-separated paths such as items/name. At runtime this single row expands into N records from the bound array.',
    'In the designer, 2 virtual preview rows are rendered after the repeat-template row for visual reference only. These are display-only and must NOT be encoded as schema rows.',
    'Designer section labels and preview-row texture are editor-only visual aids; do not encode them as text, rows, cells, or props.',
    'Header/footer background props default to empty. Only set headerBackground or summaryBackground when the user asks for colored table sections.',
    'All rows share the same column width ratios (topology.columns). Row heights are independent: header and footer have their own height, repeat-template row height applies uniformly to all data rows at runtime.',
    'Use showHeader=false or showFooter=false to hide header/footer when not needed.',
    'Do not use legacy type table, props.columns, props.repeatTemplate, headerStyle, rowStyle, or borderStyle.',
  ],
  schemaRules: [
    'Element must include table.kind = data.',
    'Element must include table.topology.columns as normalized ratios that sum to 1.',
    'Element must include table.topology.rows with exactly these roles: one header row, one repeat-template row, and one footer row (3 rows total). Header/footer can be hidden via showHeader/showFooter but must exist in topology.',
    'Each row in topology.rows must have: role ("header"|"repeat-template"|"footer"), height (number in schema.unit), and cells (array matching column count).',
    'Header row cells use content.text for column titles. Repeat-template row cells use binding for dynamic array fields. Footer row cells use content.text or staticBinding for totals.',
    'Element height is the full semantic table box in the designer; virtual preview rows stay inside that height instead of extending the outer frame.',
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
    sizing: { minWidth: 30, minHeight: 15, growAxis: 'y', defaultSize: { width: 180, height: 40 } },
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
