import type { AIMaterialDescriptor } from '@easyink/shared'

export const pageNumberAIMaterialDescriptor = {
  type: 'page-number',
  description: 'Automatic page number display for paginated fixed documents.',
  properties: ['format', 'fontSize', 'fontFamily', 'fontWeight', 'fontStyle', 'color', 'backgroundColor', 'textAlign', 'verticalAlign', 'lineHeight', 'letterSpacing'],
  requiredProps: ['format', 'fontSize', 'textAlign', 'verticalAlign', 'color'],
  binding: 'none',
  usage: [
    'Use for A4 reports, invoices, and documents that can span pages.',
    'Usually unnecessary for narrow receipts and labels.',
  ],
  knowledge: {
    category: 'typography',
    composability: {
      canBeChildOf: ['*'],
      canContain: [],
      exclusiveWith: [],
      preferredCompanions: [],
    },
    bindingSpec: {
      mode: 'none',
      accepts: { types: [], isArray: false },
      produces: { kind: 'none' },
    },
    sizing: { minWidth: 15, minHeight: 4, growAxis: 'none', defaultSize: { width: 40, height: 5 } },
    fitness: [
      { scenario: 'paginated-report', score: 0.9, reason: 'page numbers for multi-page A4 documents' },
      { scenario: 'invoice-footer', score: 0.5, reason: 'page numbers if document spans pages' },
      { scenario: 'certificate', score: 0.6, reason: 'page numbering for multi-page certificates' },
    ],
  },
} satisfies AIMaterialDescriptor
