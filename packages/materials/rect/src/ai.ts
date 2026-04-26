import type { AIMaterialDescriptor } from '@easyink/shared'

export const rectAIMaterialDescriptor = {
  type: 'rect',
  description: 'Rectangle shape for borders, backgrounds, frames, and simple visual blocks.',
  properties: ['fillColor', 'borderWidth', 'borderColor', 'borderType', 'borderRadius'],
  requiredProps: ['fillColor', 'borderWidth', 'borderColor', 'borderType'],
  binding: 'none',
  usage: [
    'Use fillColor and borderColor; do not use legacy fill or stroke props.',
  ],
} satisfies AIMaterialDescriptor
