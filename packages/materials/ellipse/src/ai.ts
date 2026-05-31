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
  knowledge: {
    category: 'decoration',
    composability: {
      canBeChildOf: ['container', '*'],
      canContain: [],
      exclusiveWith: [],
      preferredCompanions: ['text'],
    },
    bindingSpec: {
      mode: 'none',
      accepts: { types: [], isArray: false },
      produces: { kind: 'none' },
    },
    sizing: { minWidth: 5, minHeight: 5, aspectRatio: 1, growAxis: 'none', defaultSize: { width: 15, height: 15 } },
    fitness: [
      { scenario: 'seal-badge', score: 0.7, reason: 'circular seal or badge decoration' },
      { scenario: 'h5-landing', score: 0.7, reason: 'avatar frames and circular badges' },
      { scenario: 'poster', score: 0.7, reason: 'decorative circular elements' },
      { scenario: 'prototype', score: 0.75, reason: 'avatar placeholders and status indicators' },
    ],
  },
} satisfies AIMaterialDescriptor
