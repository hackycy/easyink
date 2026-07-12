import type { AIMaterialDescriptor } from '@easyink/shared'

export const rectAIMaterialDescriptor = {
  type: 'rect',
  description: 'Rectangle shape for borders, backgrounds, frames, and simple visual blocks.',
  properties: ['fillColor', 'borderWidth', 'borderColor', 'borderType', 'borderRadius'],
  requiredProps: ['fillColor', 'borderWidth', 'borderColor', 'borderType'],
  binding: 'none',
  usage: [
    'Use model.fillColor and model.borderColor.',
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
      mode: 'none',
      accepts: { types: [], isArray: false },
      produces: { kind: 'none' },
    },
    sizing: { minWidth: 5, minHeight: 5, growAxis: 'none', defaultSize: { width: 30, height: 20 } },
    fitness: [
      { scenario: 'background-frame', score: 0.7, reason: 'decorative background' },
      { scenario: 'h5-landing', score: 0.8, reason: 'card backgrounds and button shapes' },
      { scenario: 'poster', score: 0.85, reason: 'color blocks and background panels' },
      { scenario: 'prototype', score: 0.85, reason: 'UI placeholder blocks and button shapes' },
    ],
  },
} satisfies AIMaterialDescriptor
