import type { AIMaterialDescriptor } from '@easyink/shared'

export const tableDataAIMaterialDescriptor = {
  type: 'table-data',
  description: 'Dynamic data table for arrays such as receipt items, invoice lines, and order details. Composed of header row (column titles), a single repeat-template row (expands to N records at runtime), and an optional footer row (summaries/totals).',
  properties: ['headerBackground', 'summaryBackground', 'borderWidth', 'cellPadding', 'typography'],
  requiredProps: ['typography', 'borderWidth', 'cellPadding'],
  bindings: 'multi',
  usage: [
    'Use table-data whenever the template has an array/detail-list field.',
    'The table has three structural row roles: header (static column titles), repeat-template (one row that expands into N data records at runtime), and footer (static summary/totals).',
    'Header and footer band cells use text content or canonical cell:* ports in bindings for independent scalar fields.',
    'Detail band text cells reference bindingPort keys in bindings with absolute slash-separated field paths such as items/name.',
    'In the designer, 2 virtual preview rows are rendered after the repeat-template row for visual reference only. These are display-only and must NOT be encoded as schema rows.',
    'Designer section labels and preview-row texture are editor-only visual aids; do not encode them in model, bindings, or slots.',
    'Header/footer background values default to empty. Set direct model band style backgrounds only when requested.',
    'All rows use direct model.columns tracks. Header and footer rows have independent minHeight; the detail row minHeight applies to every runtime record.',
    'Use showHeader=false or showFooter=false to hide header/footer when not needed.',
    'Use direct model.columns, model.bands, model.merges, bindings, and cell:* slots only.',
  ],
  schemaRules: [
    'Model.kind must be data.',
    'Model.columns contains the direct column tracks.',
    'Model.bands contains exactly one detail band and optional header, body, and footer bands.',
    'Each direct model.bands row has a stable id, minHeight, and cells aligned by canonical columnId.',
    'Header cells use text content. Detail cells reference bindingPort keys in bindings. Footer cells use text or canonical cell:* bindings.',
    'Element height is the full semantic table box in the designer; virtual preview rows stay inside that height instead of extending the outer frame.',
    'Use direct model.style and per-band, row, or cell style objects for borders, backgrounds, padding, and typography.',
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
        { scenario: 'invoice line items', bindings: { 'records': { sourceId: 'invoice', fieldPath: 'items' }, 'cell:item-name': { sourceId: 'invoice', fieldPath: 'items/name' } }, fieldStructure: { items: [{ name: 'string', quantity: 'number', price: 'number' }] } },
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
