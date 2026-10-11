import type { DesignerMaterial } from '@easyink/plugin-api/ui'
import { IconText } from '@easyink/icons'
import { paletteGroups } from '@easyink/shared'
import { textAIMaterialDescriptor } from './ai'
import { createTextExtension } from './designer'
import { textLocaleMessages } from './locale'
import { textModel } from './material-model'
import { textDesignerPropSchemas } from './prop-schemas'

export const text: DesignerMaterial = {
  model: textModel,
  renderer: createTextExtension,
  properties: textDesignerPropSchemas,
  ai: textAIMaterialDescriptor,
  locale: textLocaleMessages,
  ui: { palette: [{ id: 'text', label: 'materials.text.name', icon: IconText, group: paletteGroups.basic, order: 3 }] },
}
