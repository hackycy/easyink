import type { DesignerMaterial } from '@easyink/plugin-api/ui'
import { IconImage } from '@easyink/icons'
import { paletteGroups } from '@easyink/shared'
import { createImageExtension } from './designer'
import { imageLocaleMessages } from './locale'
import { imageModel } from './material-model'
import { imageDesignerPropSchemas } from './prop-schemas'

export const image: DesignerMaterial = {
  model: imageModel,
  renderer: createImageExtension,
  properties: imageDesignerPropSchemas,
  locale: imageLocaleMessages,
  ui: { palette: [{ id: 'image', label: 'materials.image.name', icon: IconImage, group: paletteGroups.basic, order: 4 }] },
}
