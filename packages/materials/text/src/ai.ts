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
} satisfies AIMaterialDescriptor
