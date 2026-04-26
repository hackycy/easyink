import type { AIMaterialDescriptor } from '@easyink/shared'

export const svgAIMaterialDescriptor = {
  type: 'svg',
  description: 'Inline SVG vector block for simple custom marks and decorative vectors.',
  properties: ['content', 'viewBox', 'preserveAspectRatio', 'fillColor'],
  requiredProps: ['content', 'viewBox', 'preserveAspectRatio'],
  binding: 'none',
  usage: [
    'Use only when a simple vector mark is needed; prefer built-in shape materials for basic geometry.',
  ],
} satisfies AIMaterialDescriptor
