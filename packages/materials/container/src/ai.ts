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
  knowledge: {
    category: 'layout',
    composability: {
      canBeChildOf: ['*'],
      canContain: ['text', 'image', 'barcode', 'qrcode', 'rect', 'ellipse', 'line'],
      exclusiveWith: [],
      preferredCompanions: [],
    },
    bindingSpec: {
      mode: 'none',
      accepts: { types: [], isArray: false },
      produces: { kind: 'none' },
    },
    sizing: { minWidth: 10, minHeight: 10, growAxis: 'both', defaultSize: { width: 60, height: 40 } },
    fitness: [
      { scenario: 'grouped-elements', score: 0.9, reason: 'groups related elements into a layout box' },
      { scenario: 'h5-landing', score: 0.85, reason: 'card sections and grouped content blocks' },
      { scenario: 'poster', score: 0.8, reason: 'grouped visual elements with background' },
      { scenario: 'prototype', score: 0.9, reason: 'UI card and panel components' },
    ],
  },
} satisfies AIMaterialDescriptor
