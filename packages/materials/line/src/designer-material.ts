import type { DesignerMaterial } from '@easyink/plugin-api/ui'
import { IconLine } from '@easyink/icons'
import { paletteGroups } from '@easyink/shared'
import { createLineExtension } from './designer'
import { lineLocaleMessages } from './locale'
import { lineModel } from './material-model'
import { lineDesignerPropSchemas } from './prop-schemas'

export const line: DesignerMaterial = {
  model: lineModel,
  renderer: createLineExtension,
  properties: lineDesignerPropSchemas,
  locale: lineLocaleMessages,
  ui: { palette: [{ id: 'line', label: 'materials.line.name', icon: IconLine, group: paletteGroups.basic, order: 0 }] },
}
