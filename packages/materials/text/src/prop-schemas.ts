import type { PropSchema } from '@easyink/core'
import {
  FONT_STYLE_OPTIONS,
  FONT_WEIGHT_OPTIONS,
  HORIZONTAL_ALIGN_OPTIONS,
  STROKE_STYLE_OPTIONS,
  VERTICAL_ALIGN_OPTIONS,
} from '@easyink/prop-schemas'

const WRITING_MODE_OPTIONS: NonNullable<PropSchema['enum']> = [
  { label: 'materials.text.option.writingModeHorizontal', value: 'horizontal' },
  { label: 'materials.text.option.writingModeVertical', value: 'vertical' },
]

const HEIGHT_MODE_OPTIONS: NonNullable<PropSchema['enum']> = [
  { label: 'materials.text.option.heightModeFixed', value: 'fixed' },
  { label: 'materials.text.option.heightModeAuto', value: 'auto' },
]

const TEXT_WRAP_MODE_OPTIONS: NonNullable<PropSchema['enum']> = [
  { label: 'materials.text.option.wrapNormal', value: 'wrap' },
  { label: 'materials.text.option.wrapNoWrap', value: 'nowrap' },
  { label: 'materials.text.option.wrapAnywhere', value: 'anywhere' },
]

const OVERFLOW_OPTIONS: NonNullable<PropSchema['enum']> = [
  { label: 'materials.text.option.overflowVisible', value: 'visible' },
  { label: 'materials.text.option.overflowHidden', value: 'hidden' },
  { label: 'materials.text.option.overflowEllipsis', value: 'ellipsis' },
]

export const textDesignerPropSchemas: PropSchema[] = [
  { key: 'content', label: 'materials.text.property.content', type: 'textarea', group: 'content' },
  { key: 'prefix', label: 'materials.text.property.prefix', type: 'string', group: 'content' },
  { key: 'suffix', label: 'materials.text.property.suffix', type: 'string', group: 'content' },
  { key: 'writingMode', label: 'materials.text.property.writingMode', type: 'enum', group: 'content', enum: WRITING_MODE_OPTIONS },
  { key: 'heightMode', label: 'materials.text.property.heightMode', type: 'enum', group: 'layout', default: 'fixed', enum: HEIGHT_MODE_OPTIONS },
  { key: 'minHeight', label: 'materials.text.property.minHeight', type: 'number', group: 'layout', min: 0, max: 1000, step: 1, default: null, nullable: true, editorOptions: { placeholder: 'designer.placeholder.unbounded' }, visible: props => props.heightMode === 'auto' },
  { key: 'maxHeight', label: 'materials.text.property.maxHeight', type: 'number', group: 'layout', min: 0, max: 1000, step: 1, default: null, nullable: true, editorOptions: { placeholder: 'designer.placeholder.unbounded' }, visible: props => props.heightMode === 'auto' },
  { key: 'fontFamily', label: 'designer.property.font', type: 'font', group: 'typography' },
  { key: 'fontSize', label: 'designer.property.fontSize', type: 'number', group: 'typography', min: 1, max: 200, step: 1 },
  { key: 'fontWeight', label: 'designer.property.fontWeight', type: 'enum', group: 'typography', enum: FONT_WEIGHT_OPTIONS },
  { key: 'fontStyle', label: 'designer.property.fontStyle', type: 'enum', group: 'typography', enum: FONT_STYLE_OPTIONS },
  { key: 'textAlign', label: 'designer.property.textAlign', type: 'enum', group: 'typography', enum: HORIZONTAL_ALIGN_OPTIONS },
  { key: 'verticalAlign', label: 'designer.property.verticalAlign', type: 'enum', group: 'typography', enum: VERTICAL_ALIGN_OPTIONS },
  { key: 'lineHeight', label: 'designer.property.lineHeight', type: 'number', group: 'typography', min: 0.5, max: 5, step: 0.1 },
  { key: 'letterSpacing', label: 'designer.property.letterSpacing', type: 'number', group: 'typography', min: -5, max: 20, step: 0.5 },
  { key: 'wrapMode', label: 'materials.text.property.wrapMode', type: 'enum', group: 'typography', default: 'anywhere', enum: TEXT_WRAP_MODE_OPTIONS },
  { key: 'overflow', label: 'materials.text.property.overflow', type: 'enum', group: 'typography', enum: OVERFLOW_OPTIONS },
  { key: 'color', label: 'designer.property.color', type: 'color', group: 'appearance' },
  { key: 'backgroundColor', label: 'designer.property.background', type: 'color', group: 'appearance' },
  { key: 'borderWidth', label: 'designer.property.borderWidth', type: 'number', group: 'border', min: 0, max: 20, step: 1 },
  { key: 'borderColor', label: 'designer.property.borderColor', type: 'color', group: 'border' },
  { key: 'borderType', label: 'designer.property.borderType', type: 'enum', group: 'border', enum: STROKE_STYLE_OPTIONS },
]
