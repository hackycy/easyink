import type { PropertyDescriptor } from '@easyink/core'
import { createModelPropertyAccessor, createNodePropertyAccessor } from '@easyink/core'
import { createTableBorderPropertyAccessor, createTablePaddingPropertyAccessor } from '@easyink/material-table-kernel'
import {
  FONT_STYLE_OPTIONS,
  FONT_WEIGHT_OPTIONS,
  HORIZONTAL_ALIGN_OPTIONS,
  STROKE_STYLE_OPTIONS,
  VERTICAL_ALIGN_OPTIONS,
} from '@easyink/prop-schemas'

const TABLE_TEXT_ALIGN_ACCESSOR = createNodePropertyAccessor<'left' | 'center' | 'right'>('/model/style/typography/textAlign', {
  readValue: value => value === 'start' ? 'left' : value === 'end' ? 'right' : 'center',
  writeValue: value => value === 'left' ? 'start' : value === 'right' ? 'end' : 'center',
})

export const tableDataBaseDesignerPropSchemas: PropertyDescriptor[] = [
  { key: 'borderWidth', accessor: createTableBorderPropertyAccessor('width') as PropertyDescriptor['accessor'], label: 'designer.property.borderWidth', type: 'number', group: 'table-border', min: 0, max: 10, step: 1 },
  { key: 'borderColor', accessor: createTableBorderPropertyAccessor('color') as PropertyDescriptor['accessor'], label: 'designer.property.borderColor', type: 'color', group: 'table-border' },
  { key: 'borderType', accessor: createTableBorderPropertyAccessor('style') as PropertyDescriptor['accessor'], label: 'designer.property.borderType', type: 'enum', group: 'table-border', enum: STROKE_STYLE_OPTIONS },
  { key: 'cellPadding', accessor: createTablePaddingPropertyAccessor() as PropertyDescriptor['accessor'], label: 'designer.property.padding', type: 'number', group: 'table-layout', min: 0, max: 20, step: 1 },
  { key: 'typography.fontFamily', accessor: createModelPropertyAccessor('/style/typography/fontFamily'), label: 'designer.property.font', type: 'font', group: 'table-typography' },
  { key: 'typography.fontSize', accessor: createModelPropertyAccessor('/style/typography/fontSize'), label: 'designer.property.fontSize', type: 'number', group: 'table-typography', min: 1, max: 100, step: 1 },
  { key: 'typography.color', accessor: createModelPropertyAccessor('/style/typography/color'), label: 'designer.property.color', type: 'color', group: 'table-typography' },
  { key: 'typography.fontWeight', accessor: createModelPropertyAccessor('/style/typography/fontWeight'), label: 'designer.property.fontWeight', type: 'enum', group: 'table-typography', enum: FONT_WEIGHT_OPTIONS },
  { key: 'typography.fontStyle', accessor: createModelPropertyAccessor('/style/typography/fontStyle'), label: 'designer.property.fontStyle', type: 'enum', group: 'table-typography', enum: FONT_STYLE_OPTIONS },
  { key: 'typography.textAlign', accessor: TABLE_TEXT_ALIGN_ACCESSOR as PropertyDescriptor['accessor'], label: 'designer.property.textAlign', type: 'enum', group: 'table-typography', enum: HORIZONTAL_ALIGN_OPTIONS },
  { key: 'typography.verticalAlign', accessor: createModelPropertyAccessor('/style/typography/verticalAlign'), label: 'designer.property.verticalAlign', type: 'enum', group: 'table-typography', enum: VERTICAL_ALIGN_OPTIONS },
  { key: 'typography.lineHeight', accessor: createModelPropertyAccessor('/style/typography/lineHeight'), label: 'designer.property.lineHeight', type: 'number', group: 'table-typography', min: 0.5, max: 5, step: 0.1 },
  { key: 'typography.letterSpacing', accessor: createModelPropertyAccessor('/style/typography/letterSpacing'), label: 'designer.property.letterSpacing', type: 'number', group: 'table-typography', min: -5, max: 20, step: 0.5 },
]

/**
 * Designer prop schemas owned by the table-data material.
 *
 * Table controls declare explicit model accessors. The editing transaction owns
 * commit lifecycle and session cleanup.
 */
export const tableDataDesignerPropSchemas: PropertyDescriptor[] = [...tableDataBaseDesignerPropSchemas]
