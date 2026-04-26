import type { AIMaterialDescriptor } from '@easyink/shared'

export const chartAIMaterialDescriptor = {
  type: 'chart',
  description: 'Chart visualization for report templates with numeric series data.',
  properties: ['chartType', 'data', 'options', 'backgroundColor'],
  requiredProps: ['chartType', 'data', 'options'],
  binding: 'multi',
  usage: [
    'Use only for analytic reports; do not use for receipts, invoices, labels, or plain tables.',
  ],
} satisfies AIMaterialDescriptor
