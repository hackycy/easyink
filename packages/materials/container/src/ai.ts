import type { AIMaterialDescriptor } from '@easyink/shared'

export const containerAIMaterialDescriptor = {
  type: 'container',
  description: 'Container that owns child material nodes for grouped layout.',
  properties: ['padding', 'gap', 'direction', 'fillColor', 'borderWidth', 'borderColor', 'borderType'],
  requiredProps: ['padding', 'gap', 'direction'],
  binding: 'none',
  usage: [
    'Use children for grouped elements only when hierarchy is needed.',
    'Absolute positioning still applies to the container itself.',
  ],
} satisfies AIMaterialDescriptor
