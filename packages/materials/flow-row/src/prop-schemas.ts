import type { PropertyDescriptor } from '@easyink/core'
import { createModelPropertyAccessor } from '@easyink/core'
import {
  FONT_STYLE_OPTIONS,
  FONT_WEIGHT_OPTIONS,
} from '@easyink/prop-schemas'

export const flowRowDesignerPropSchemas: PropertyDescriptor[] = [
  { key: 'gap', label: 'materials.flowRow.property.gap', type: 'number', group: 'layout', min: 0, max: 20, step: 0.5 },
  { key: 'paddingX', label: 'materials.flowRow.property.paddingHorizontal', type: 'number', group: 'layout', min: 0, max: 20, step: 0.5 },
  { key: 'paddingY', label: 'materials.flowRow.property.paddingVertical', type: 'number', group: 'layout', min: 0, max: 20, step: 0.5 },
  { key: 'typography.fontFamily', accessor: createModelPropertyAccessor('/typography/fontFamily'), label: 'designer.property.font', type: 'font', group: 'typography' },
  { key: 'typography.fontSize', accessor: createModelPropertyAccessor('/typography/fontSize'), label: 'designer.property.fontSize', type: 'number', group: 'typography', min: 1, max: 100, step: 1 },
  { key: 'typography.color', accessor: createModelPropertyAccessor('/typography/color'), label: 'designer.property.color', type: 'color', group: 'typography' },
  { key: 'typography.fontWeight', accessor: createModelPropertyAccessor('/typography/fontWeight'), label: 'designer.property.fontWeight', type: 'enum', group: 'typography', enum: FONT_WEIGHT_OPTIONS },
  { key: 'typography.fontStyle', accessor: createModelPropertyAccessor('/typography/fontStyle'), label: 'designer.property.fontStyle', type: 'enum', group: 'typography', enum: FONT_STYLE_OPTIONS },
  { key: 'typography.lineHeight', accessor: createModelPropertyAccessor('/typography/lineHeight'), label: 'designer.property.lineHeight', type: 'number', group: 'typography', min: 0.5, max: 5, step: 0.1 },
  { key: 'typography.letterSpacing', accessor: createModelPropertyAccessor('/typography/letterSpacing'), label: 'designer.property.letterSpacing', type: 'number', group: 'typography', min: -5, max: 20, step: 0.5 },
  { key: 'backgroundColor', label: 'designer.property.background', type: 'color', group: 'appearance' },
]
