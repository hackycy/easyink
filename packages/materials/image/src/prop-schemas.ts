import type { PropSchema } from '@easyink/core'
import { STROKE_STYLE_OPTIONS } from '@easyink/prop-schemas'

const IMAGE_FIT_OPTIONS: NonNullable<PropSchema['enum']> = [
  { label: 'materials.image.option.fitContain', value: 'contain' },
  { label: 'materials.image.option.fitCover', value: 'cover' },
  { label: 'materials.image.option.fitFill', value: 'fill' },
  { label: 'materials.image.option.fitNone', value: 'none' },
]

export const imageDesignerPropSchemas: PropSchema[] = [
  {
    key: 'src',
    label: 'materials.image.property.src',
    type: 'image',
    group: 'content',
    editorOptions: {
      pickTitle: 'materials.image.action.pick',
      clearTitle: 'materials.image.action.clear',
      previewTitle: 'materials.image.action.preview',
      previewLoadingTitle: 'materials.image.action.previewLoading',
      previewFailedTitle: 'materials.image.action.previewFailed',
    },
  },
  { key: 'fit', label: 'materials.image.property.fit', type: 'enum', group: 'content', enum: IMAGE_FIT_OPTIONS },
  { key: 'alt', label: 'materials.image.property.alt', type: 'string', group: 'content' },
  { key: 'backgroundColor', label: 'designer.property.background', type: 'color', group: 'appearance' },
  { key: 'borderWidth', label: 'designer.property.borderWidth', type: 'number', group: 'border', min: 0, max: 20, step: 1 },
  { key: 'borderColor', label: 'designer.property.borderColor', type: 'color', group: 'border' },
  { key: 'borderType', label: 'designer.property.borderType', type: 'enum', group: 'border', enum: STROKE_STYLE_OPTIONS },
]
