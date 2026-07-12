import type { AIMaterialDescriptor } from '@easyink/shared'

export const svgCustomAIMaterialDescriptor = {
  type: 'svg-custom',
  description: 'Custom SVG material that accepts complete pasted <svg> documents or sanitized SVG child markup.',
  properties: ['content'],
  requiredProps: ['content'],
  bindings: 'single',
  usage: [
    'Use this material only when the user needs to paste or generate raw SVG markup directly.',
    'Bind this material only when the data source provides raw SVG text; remote SVG URLs are rejected by the Viewer.',
    'For built-in shapes such as star, ellipse, or heart, use the dedicated SVG shape materials instead of writing SVG content.',
  ],
  knowledge: {
    category: 'decoration',
    composability: {
      canBeChildOf: ['*'],
      canContain: [],
      exclusiveWith: [],
      preferredCompanions: ['text'],
    },
    bindingSpec: {
      mode: 'scalar',
      accepts: { types: ['string'], isArray: false },
      produces: { kind: 'scalar-field', fieldCount: 'single', pathPattern: '{fieldPath}' },
      examples: [
        { scenario: 'bound logo svg', bindings: { value: { sourceId: 'brand', fieldPath: 'logoSvg' } }, fieldStructure: { logoSvg: 'string' } },
      ],
    },
    sizing: { minWidth: 10, minHeight: 10, aspectRatio: 'free', growAxis: 'none', defaultSize: { width: 30, height: 30 } },
    fitness: [
      { scenario: 'h5-landing', score: 0.8, reason: 'custom icons, illustrations, and brand graphics' },
      { scenario: 'poster', score: 0.85, reason: 'custom vector illustrations and decorative graphics' },
      { scenario: 'prototype', score: 0.7, reason: 'custom icon placeholders' },
      { scenario: 'certificate', score: 0.7, reason: 'custom seals, logos, and decorative borders' },
    ],
  },
} satisfies AIMaterialDescriptor
