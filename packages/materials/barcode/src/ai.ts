import type { AIMaterialDescriptor } from '@easyink/shared'

export const barcodeAIMaterialDescriptor = {
  type: 'barcode',
  description: 'Barcode generated from props.value or a bound code field.',
  properties: ['value', 'format', 'showText', 'lineWidth', 'lineColor', 'backgroundColor', 'borderWidth', 'borderColor', 'borderType'],
  requiredProps: ['value', 'format', 'showText', 'lineWidth', 'lineColor', 'backgroundColor'],
  binding: 'single',
  usage: [
    'Use CODE128 for generic order numbers and EAN13/EAN8 for retail goods codes.',
  ],
  knowledge: {
    category: 'data',
    composability: {
      canBeChildOf: ['container', '*'],
      canContain: [],
      exclusiveWith: [],
      preferredCompanions: ['text'],
    },
    bindingSpec: {
      mode: 'scalar',
      accepts: { types: ['string', 'number'], isArray: false },
      produces: { kind: 'scalar-field', fieldCount: 'single', pathPattern: '{fieldPath}' },
      examples: [
        { scenario: 'order barcode', binding: { sourceId: 'order', fieldPath: 'orderNo' }, fieldStructure: { orderNo: 'string' } },
      ],
    },
    sizing: { minWidth: 20, minHeight: 8, growAxis: 'none', defaultSize: { width: 50, height: 15 } },
    fitness: [
      { scenario: 'product-label', score: 0.9, reason: 'product code barcode' },
      { scenario: 'shipping-label', score: 0.9, reason: 'tracking number barcode' },
      { scenario: 'invoice-footer', score: 0.7, reason: 'order number barcode' },
      { scenario: 'h5-landing', score: 0.5, reason: 'rarely used on screen but possible for ticket codes' },
      { scenario: 'certificate', score: 0.6, reason: 'verification code on certificates' },
    ],
  },
} satisfies AIMaterialDescriptor
