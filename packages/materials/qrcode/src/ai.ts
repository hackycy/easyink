import type { AIMaterialDescriptor } from '@easyink/shared'

export const qrcodeAIMaterialDescriptor = {
  type: 'qrcode',
  description: 'QR code generated from props.value or a bound text/URL field.',
  properties: ['value', 'size', 'errorCorrectionLevel', 'foreground', 'background', 'borderWidth', 'borderColor', 'borderType'],
  requiredProps: ['value', 'size', 'errorCorrectionLevel', 'foreground', 'background'],
  binding: 'single',
  usage: [
    'Use for payment URLs, receipt verification URLs, and label traceability links.',
    'Keep width and height equal for square codes.',
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
      accepts: { types: ['string'], isArray: false },
      produces: { kind: 'scalar-field', fieldCount: 'single', pathPattern: '{fieldPath}' },
      examples: [
        { scenario: 'payment QR', binding: { sourceId: 'receipt', fieldPath: 'paymentUrl' }, fieldStructure: { paymentUrl: 'string' } },
      ],
    },
    sizing: { minWidth: 15, minHeight: 15, aspectRatio: 1, growAxis: 'none', defaultSize: { width: 20, height: 20 } },
    fitness: [
      { scenario: 'receipt-footer', score: 0.8, reason: 'payment or verification QR code' },
      { scenario: 'product-label', score: 0.7, reason: 'traceability QR' },
      { scenario: 'h5-landing', score: 0.75, reason: 'download links and promotional URLs' },
      { scenario: 'poster', score: 0.7, reason: 'event registration or website URL' },
    ],
  },
} satisfies AIMaterialDescriptor
