import type { DesignerMaterial } from '@easyink/plugin-api/ui'
import { IconEllipse } from '@easyink/icons'
import { paletteGroups } from '@easyink/shared'
import { createEllipseExtension } from './designer'
import { ellipseLocaleMessages } from './locale'
import { ellipseModel } from './material-model'
import { ellipseDesignerPropSchemas } from './prop-schemas'

export const ellipse: DesignerMaterial = {
  model: ellipseModel,
  renderer: createEllipseExtension,
  properties: ellipseDesignerPropSchemas,
  locale: ellipseLocaleMessages,
  ui: { palette: [{ id: 'ellipse', label: 'materials.ellipse.name', icon: IconEllipse, group: paletteGroups.basic, order: 2 }] },
}
