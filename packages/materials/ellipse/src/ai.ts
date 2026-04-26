import type { AIMaterialDescriptor } from '@easyink/shared'

export const ellipseAIMaterialDescriptor = {
  type: 'ellipse',
  description: 'Ellipse or circle shape for badges, seals, and simple decoration.',
  properties: ['fillColor', 'borderWidth', 'borderColor', 'borderType'],
  requiredProps: ['fillColor', 'borderWidth', 'borderColor', 'borderType'],
  binding: 'none',
  usage: [
    'Use sparingly; prefer text, line, and table-data for document structure.',
  ],
} satisfies AIMaterialDescriptor
