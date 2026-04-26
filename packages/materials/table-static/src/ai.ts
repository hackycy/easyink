import type { AIMaterialDescriptor } from '@easyink/shared'

export const tableStaticAIMaterialDescriptor = {
  type: 'table-static',
  description: 'Fixed table for forms, headers, and non-repeating grid layouts.',
  properties: ['borderWidth', 'cellPadding', 'typography'],
  requiredProps: ['typography', 'borderWidth', 'cellPadding'],
  binding: 'multi',
  usage: [
    'Use table-static only when row count is fixed and not driven by an array.',
    'Cells use content.text for static labels or staticBinding for independent scalar fields.',
  ],
  schemaRules: [
    'Element must include table.kind = static.',
    'Element must include table.topology.columns and table.topology.rows.',
  ],
} satisfies AIMaterialDescriptor
