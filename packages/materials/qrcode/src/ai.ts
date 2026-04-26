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
} satisfies AIMaterialDescriptor
