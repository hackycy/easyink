import type { PropertyDescriptor } from '@easyink/core'
import {
  FONT_STYLE_OPTIONS,
  FONT_WEIGHT_OPTIONS,
} from '@easyink/prop-schemas'

export const ringProgressDesignerPropSchemas: PropertyDescriptor[] = [
  { key: 'value', label: 'materials.ringProgress.property.value', type: 'number', group: 'content', min: 0, max: 100, step: 1 },
  { key: 'suffix', label: 'materials.ringProgress.property.suffix', type: 'string', group: 'content' },
  { key: 'showText', label: 'materials.ringProgress.property.showText', type: 'switch', group: 'content' },
  { key: 'progressWidth', label: 'materials.ringProgress.property.progressWidth', type: 'number', group: 'appearance', min: 0.1, max: 100, step: 0.5 },
  { key: 'trackColor', label: 'materials.ringProgress.property.trackColor', type: 'color', group: 'appearance' },
  { key: 'progressColor', label: 'materials.ringProgress.property.progressColor', type: 'color', group: 'appearance' },
  { key: 'fontFamily', label: 'designer.property.font', type: 'font', group: 'typography', visible: props => props.showText !== false },
  { key: 'fontSize', label: 'designer.property.fontSize', type: 'number', group: 'typography', min: 1, max: 200, step: 1, visible: props => props.showText !== false },
  { key: 'fontWeight', label: 'designer.property.fontWeight', type: 'enum', group: 'typography', enum: FONT_WEIGHT_OPTIONS, visible: props => props.showText !== false },
  { key: 'fontStyle', label: 'designer.property.fontStyle', type: 'enum', group: 'typography', enum: FONT_STYLE_OPTIONS, visible: props => props.showText !== false },
  { key: 'color', label: 'designer.property.color', type: 'color', group: 'typography', visible: props => props.showText !== false },
]
