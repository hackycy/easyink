import type { DesignerMaterial } from '@easyink/plugin-api/ui'
import { IconRingProgress } from '@easyink/icons'
import { paletteGroups } from '@easyink/shared'
import { createRingProgressExtension } from './designer'
import { ringProgressLocaleMessages } from './locale'
import { ringProgressModel } from './material-model'
import { ringProgressDesignerPropSchemas } from './prop-schemas'

export const ringProgress: DesignerMaterial = {
  model: ringProgressModel,
  renderer: createRingProgressExtension,
  properties: ringProgressDesignerPropSchemas,
  locale: ringProgressLocaleMessages,
  ui: { palette: [{ id: 'ringProgress', label: 'materials.ringProgress.name', icon: IconRingProgress, group: paletteGroups.data, order: 3 }] },
}
