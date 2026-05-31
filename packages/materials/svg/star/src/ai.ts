import type { AIMaterialDescriptor } from '@easyink/shared'

export const svgStarAIMaterialDescriptor = {
  type: 'svg-star',
  description: 'Editable star SVG material with point count, inner ratio, and rotation controls.',
  properties: ['fillColor', 'borderWidth', 'borderColor', 'starPoints', 'starInnerRatio', 'starRotation'],
  requiredProps: ['fillColor', 'starPoints', 'starInnerRatio'],
  binding: 'none',
  usage: [
    'Use this material for decorative stars that need direct on-canvas editing.',
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
    sizing: { minWidth: 8, minHeight: 8, aspectRatio: 1, growAxis: 'none', defaultSize: { width: 20, height: 20 } },
    fitness: [
      { scenario: 'h5-landing', score: 0.7, reason: 'decorative star ratings or promotional highlights' },
      { scenario: 'poster', score: 0.75, reason: 'decorative star accents' },
      { scenario: 'certificate', score: 0.7, reason: 'award or achievement star decoration' },
      { scenario: 'prototype', score: 0.6, reason: 'rating indicator placeholder' },
    ],
  },
} satisfies AIMaterialDescriptor
