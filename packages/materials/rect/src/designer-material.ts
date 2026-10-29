import type { DesignerMaterial } from '@easyink/plugin-api/ui'
import { IconRect } from '@easyink/icons'
import { paletteGroups } from '@easyink/shared'
import { createRectExtension } from './designer'
import { rectLocaleMessages } from './locale'
import { rectModel } from './material-model'
import { rectDesignerPropSchemas } from './prop-schemas'

export const rect: DesignerMaterial = {
  model: rectModel,
  renderer: createRectExtension,
  properties: rectDesignerPropSchemas,
  locale: rectLocaleMessages,
  ui: { palette: [{ id: 'rect', label: 'materials.rect.name', icon: IconRect, group: paletteGroups.basic, order: 1 }] },
}
