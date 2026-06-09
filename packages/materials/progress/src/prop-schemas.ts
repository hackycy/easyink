import type { PropSchema } from '@easyink/core'
import {
  FONT_STYLE_OPTIONS,
  FONT_WEIGHT_OPTIONS,
} from '@easyink/prop-schemas'

const TEXT_POSITION_OPTIONS: NonNullable<PropSchema['enum']> = [
  { label: 'materials.progress.option.textPositionTop', value: 'top' },
  { label: 'materials.progress.option.textPositionBottom', value: 'bottom' },
]

export const progressDesignerPropSchemas: PropSchema[] = [
  { key: 'value', label: 'materials.progress.property.value', type: 'number', group: 'content', min: 0, max: 100, step: 1 },
  { key: 'suffix', label: 'materials.progress.property.suffix', type: 'string', group: 'content' },
  { key: 'showText', label: 'materials.progress.property.showText', type: 'switch', group: 'content' },
  { key: 'textPosition', label: 'materials.progress.property.textPosition', type: 'enum', group: 'content', enum: TEXT_POSITION_OPTIONS, visible: props => props.showText !== false },
  { key: 'progressHeight', label: 'materials.progress.property.progressHeight', type: 'number', group: 'appearance', min: 0.1, max: 100, step: 0.5 },
  { key: 'trackColor', label: 'materials.progress.property.trackColor', type: 'color', group: 'appearance' },
  { key: 'progressColor', label: 'materials.progress.property.progressColor', type: 'color', group: 'appearance' },
  { key: 'fontFamily', label: 'designer.property.font', type: 'font', group: 'typography', visible: props => props.showText !== false },
  { key: 'fontSize', label: 'designer.property.fontSize', type: 'number', group: 'typography', min: 1, max: 200, step: 1, visible: props => props.showText !== false },
  { key: 'fontWeight', label: 'designer.property.fontWeight', type: 'enum', group: 'typography', enum: FONT_WEIGHT_OPTIONS, visible: props => props.showText !== false },
  { key: 'fontStyle', label: 'designer.property.fontStyle', type: 'enum', group: 'typography', enum: FONT_STYLE_OPTIONS, visible: props => props.showText !== false },
  { key: 'color', label: 'designer.property.color', type: 'color', group: 'typography', visible: props => props.showText !== false },
]
