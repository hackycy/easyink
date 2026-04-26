import type { AIMaterialDescriptor } from '@easyink/shared'

export const textAIMaterialDescriptor = {
  type: 'text',
  description: 'Text block for static labels and data-bound scalar fields.',
  properties: ['content', 'fontSize', 'fontFamily', 'fontWeight', 'fontStyle', 'color', 'backgroundColor', 'textAlign', 'verticalAlign', 'lineHeight', 'letterSpacing', 'autoWrap', 'overflow', 'richText', 'prefix', 'suffix', 'borderWidth', 'borderColor', 'borderType'],
  requiredProps: ['content', 'fontSize', 'textAlign', 'verticalAlign', 'color'],
  binding: 'single',
  usage: [
    'Use props.content for static text and placeholders such as {#fieldLabel}.',
    'Use binding for dynamic scalar fields; keep fieldPath slash-separated.',
  ],
} satisfies AIMaterialDescriptor
