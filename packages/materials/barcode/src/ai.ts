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
} satisfies AIMaterialDescriptor
