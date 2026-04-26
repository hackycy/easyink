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
} satisfies AIMaterialDescriptor
