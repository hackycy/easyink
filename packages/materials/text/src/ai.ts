import type { AIMaterialDescriptor } from '@easyink/shared'

export const textAIMaterialDescriptor = {
  type: 'text',
  description: 'Text block for static labels and data-bound scalar fields. Supports fixed-height clipping and auto-height flow layout.',
  properties: ['content', 'writingMode', 'heightMode', 'fontSize', 'fontFamily', 'fontWeight', 'fontStyle', 'color', 'backgroundColor', 'textAlign', 'verticalAlign', 'lineHeight', 'letterSpacing', 'wrapMode', 'autoWrap', 'overflow', 'minHeight', 'maxHeight', 'prefix', 'suffix', 'borderWidth', 'borderColor', 'borderType'],
  requiredProps: ['content', 'fontSize', 'textAlign', 'verticalAlign', 'color'],
  binding: 'single',
  usage: [
    'Use props.content for static text and placeholders such as {#fieldLabel}.',
    'Use binding for dynamic scalar fields; keep fieldPath slash-separated.',
    'Use props.heightMode="auto" when long or bound text should grow vertically and participate in stack flow layout.',
    'Use props.wrapMode for wrapping behavior: "wrap" for word wrapping, "anywhere" for long codes/CJK-heavy labels, and "nowrap" for single-line text.',
  ],
  knowledge: {
    category: 'typography',
    composability: {
      canBeChildOf: ['*'],
      canContain: [],
      exclusiveWith: [],
      preferredCompanions: ['line', 'rect'],
    },
    bindingSpec: {
      mode: 'scalar',
      accepts: { types: ['string', 'number', 'boolean', 'date'], isArray: false },
      produces: { kind: 'scalar-field', fieldCount: 'single', pathPattern: '{fieldPath}' },
      examples: [
        { scenario: 'invoice title', binding: { sourceId: 'invoice', fieldPath: 'title' }, fieldStructure: { title: 'string' } },
      ],
    },
    sizing: { minWidth: 10, minHeight: 4, growAxis: 'y', defaultSize: { width: 40, height: 6 } },
    fitness: [
      { scenario: 'invoice-header', score: 0.9, reason: 'titles and labels are text elements' },
      { scenario: 'receipt-header', score: 0.9, reason: 'shop name and receipt title' },
      { scenario: 'key-value-pair', score: 0.95, reason: 'scalar field display' },
      { scenario: 'form-label', score: 0.9, reason: 'static label text' },
      { scenario: 'footer-notes', score: 0.8, reason: 'remark and note text' },
      { scenario: 'h5-landing', score: 0.9, reason: 'headings, descriptions, and call-to-action text' },
      { scenario: 'poster', score: 0.9, reason: 'title, subtitle, and body copy' },
      { scenario: 'prototype', score: 0.85, reason: 'UI labels and placeholder text' },
      { scenario: 'certificate', score: 0.9, reason: 'recipient name and certificate title' },
    ],
  },
} satisfies AIMaterialDescriptor
