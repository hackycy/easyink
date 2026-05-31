import type { AIMaterialDescriptor } from '@easyink/shared'

export const svgHeartAIMaterialDescriptor = {
  type: 'svg-heart',
  description: 'Heart SVG material with editable cleft depth and shoulder width.',
  properties: ['fillColor', 'borderWidth', 'borderColor', 'heartCleftDepth', 'heartShoulderWidth'],
  requiredProps: ['fillColor'],
  binding: 'none',
  usage: [
    'Use this material for heart graphics that need shape-specific controls.',
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
      { scenario: 'h5-landing', score: 0.75, reason: 'like/favorite icons and promotional love themes' },
      { scenario: 'poster', score: 0.7, reason: 'romantic or emotional decorative element' },
      { scenario: 'certificate', score: 0.5, reason: 'rarely used but possible for appreciation themes' },
    ],
  },
} satisfies AIMaterialDescriptor
