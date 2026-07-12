import type { AIMaterialDescriptor } from '@easyink/shared'

export const imageAIMaterialDescriptor = {
  type: 'image',
  description: 'Image block for logos, product images, stamps, and externally supplied image URLs.',
  properties: ['src', 'fit', 'alt', 'backgroundColor', 'borderWidth', 'borderColor', 'borderType'],
  requiredProps: ['src', 'fit', 'alt'],
  bindings: 'single',
  usage: [
    'Use fit contain for logos and cover for cropped photos.',
    'Bind image fields only when the data source provides an image URL.',
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
      accepts: { types: ['image-url', 'string'], isArray: false },
      produces: { kind: 'scalar-field', fieldCount: 'single', pathPattern: '{fieldPath}' },
      examples: [
        { scenario: 'company logo', bindings: { src: { sourceId: 'company', fieldPath: 'logoUrl' } }, fieldStructure: { logoUrl: 'string' } },
      ],
    },
    sizing: { minWidth: 8, minHeight: 8, aspectRatio: 'free', growAxis: 'none', defaultSize: { width: 25, height: 25 } },
    fitness: [
      { scenario: 'invoice-header', score: 0.7, reason: 'company logo placement' },
      { scenario: 'product-label', score: 0.8, reason: 'product image display' },
      { scenario: 'h5-landing', score: 0.95, reason: 'hero banners, product photos, and promotional images' },
      { scenario: 'poster', score: 0.95, reason: 'background images, photos, and visual elements' },
      { scenario: 'prototype', score: 0.8, reason: 'placeholder images and avatars' },
      { scenario: 'certificate', score: 0.7, reason: 'logo and decorative seal images' },
    ],
  },
} satisfies AIMaterialDescriptor
