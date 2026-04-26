import type { AIMaterialDescriptor } from '@easyink/shared'

export const lineAIMaterialDescriptor = {
  type: 'line',
  description: 'Straight separator line. The element width and height define line length and thickness.',
  properties: ['lineColor', 'lineType'],
  requiredProps: ['lineColor', 'lineType'],
  binding: 'none',
  usage: [
    'Use for receipt separators, section rules, and simple borders.',
    'Do not use legacy stroke, strokeWidth, x1, y1, x2, or y2 props.',
  ],
} satisfies AIMaterialDescriptor
