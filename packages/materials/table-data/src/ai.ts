import type { AIMaterialDescriptor } from '@easyink/shared'

export const tableDataAIMaterialDescriptor = {
  type: 'table-data',
  description: 'Dynamic data table for arrays such as receipt items, invoice lines, and order details.',
  properties: ['headerBackground', 'summaryBackground', 'stripedRows', 'stripedColor', 'borderWidth', 'cellPadding', 'typography'],
  requiredProps: ['typography', 'borderWidth', 'cellPadding'],
  binding: 'multi',
  usage: [
    'Use table-data whenever the template has an array/detail-list field.',
    'The data content area is defined by one repeat-template row. At runtime that single row expands into N records from the bound array.',
    'Header cells use content.text. Repeat-template cells use binding with absolute slash-separated paths such as items/name.',
    'In the designer, EasyInk may render two virtual preview rows after the repeat-template row to preview the data area. Those preview rows are display-only and must not be encoded as extra schema rows.',
    'Do not use legacy type table, props.columns, props.repeatTemplate, headerStyle, rowStyle, or borderStyle.',
  ],
  schemaRules: [
    'Element must include table.kind = data.',
    'Element must include table.topology.columns as normalized ratios that sum to 1.',
    'Element must include table.topology.rows with a header row and a repeat-template row for array data.',
    'Element must keep the preview semantics in the renderer only: table.topology.rows stores the real structural rows, not duplicated sample rows.',
    'Element must include table.layout with borderAppearance, borderWidth, borderType, and borderColor.',
  ],
} satisfies AIMaterialDescriptor
