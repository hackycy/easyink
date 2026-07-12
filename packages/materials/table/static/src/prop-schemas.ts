import type { NodePropertyAccessorOptions, PropertyAccessor, PropertyDescriptor } from '@easyink/core'
import { createNodePropertyAccessor } from '@easyink/core'
import { createTableBorderPropertyAccessor, createTablePaddingPropertyAccessor } from '@easyink/material-table-kernel'
import {
  FONT_STYLE_OPTIONS,
  FONT_WEIGHT_OPTIONS,
  HORIZONTAL_ALIGN_OPTIONS,
  STROKE_STYLE_OPTIONS,
  VERTICAL_ALIGN_OPTIONS,
} from '@easyink/prop-schemas'

function createTypographyAccessor<T>(field: string, options: NodePropertyAccessorOptions<T> = {}): PropertyAccessor<T> {
  const path = `/model/style/typography/${field}` as const
  return createNodePropertyAccessor<T>(path, {
    ...options,
    paths: ['/model/style/typography'],
    pathSharingGroup: 'table-typography',
  })
}

const TABLE_TEXT_ALIGN_ACCESSOR = createTypographyAccessor<'left' | 'center' | 'right'>('textAlign', {
  readValue: value => value === 'start' ? 'left' : value === 'end' ? 'right' : 'center',
  writeValue: value => value === 'left' ? 'start' : value === 'right' ? 'end' : 'center',
})

export const tableStaticDesignerPropSchemas: PropertyDescriptor[] = [
  { key: 'borderWidth', accessor: createTableBorderPropertyAccessor('width') as PropertyDescriptor['accessor'], label: 'designer.property.borderWidth', type: 'number', group: 'table-border', min: 0, max: 10, step: 1 },
  { key: 'borderColor', accessor: createTableBorderPropertyAccessor('color') as PropertyDescriptor['accessor'], label: 'designer.property.borderColor', type: 'color', group: 'table-border' },
  { key: 'borderType', accessor: createTableBorderPropertyAccessor('style') as PropertyDescriptor['accessor'], label: 'designer.property.borderType', type: 'enum', group: 'table-border', enum: STROKE_STYLE_OPTIONS },
  { key: 'cellPadding', accessor: createTablePaddingPropertyAccessor() as PropertyDescriptor['accessor'], label: 'designer.property.padding', type: 'number', group: 'table-layout', min: 0, max: 20, step: 1 },
  { key: 'typography.fontFamily', accessor: createTypographyAccessor('fontFamily'), label: 'designer.property.font', type: 'font', group: 'table-typography' },
  { key: 'typography.fontSize', accessor: createTypographyAccessor('fontSize'), label: 'designer.property.fontSize', type: 'number', group: 'table-typography', min: 1, max: 100, step: 1 },
  { key: 'typography.color', accessor: createTypographyAccessor('color'), label: 'designer.property.color', type: 'color', group: 'table-typography' },
  { key: 'typography.fontWeight', accessor: createTypographyAccessor('fontWeight'), label: 'designer.property.fontWeight', type: 'enum', group: 'table-typography', enum: FONT_WEIGHT_OPTIONS },
  { key: 'typography.fontStyle', accessor: createTypographyAccessor('fontStyle'), label: 'designer.property.fontStyle', type: 'enum', group: 'table-typography', enum: FONT_STYLE_OPTIONS },
  { key: 'typography.textAlign', accessor: TABLE_TEXT_ALIGN_ACCESSOR as PropertyDescriptor['accessor'], label: 'designer.property.textAlign', type: 'enum', group: 'table-typography', enum: HORIZONTAL_ALIGN_OPTIONS },
  { key: 'typography.verticalAlign', accessor: createTypographyAccessor('verticalAlign'), label: 'designer.property.verticalAlign', type: 'enum', group: 'table-typography', enum: VERTICAL_ALIGN_OPTIONS },
  { key: 'typography.lineHeight', accessor: createTypographyAccessor('lineHeight'), label: 'designer.property.lineHeight', type: 'number', group: 'table-typography', min: 0.5, max: 5, step: 0.1 },
  { key: 'typography.letterSpacing', accessor: createTypographyAccessor('letterSpacing'), label: 'designer.property.letterSpacing', type: 'number', group: 'table-typography', min: -5, max: 20, step: 0.5 },
]
