import type { DesignerMaterial } from '@easyink/plugin-api/ui'
import { IconProgress } from '@easyink/icons'
import { paletteGroups } from '@easyink/shared'
import { progressAIMaterialDescriptor } from './ai'
import { createProgressExtension } from './designer'
import { progressLocaleMessages } from './locale'
import { progressModel } from './material-model'
import { progressDesignerPropSchemas } from './prop-schemas'

export const progress: DesignerMaterial = {
  model: progressModel,
  renderer: createProgressExtension,
  properties: progressDesignerPropSchemas,
  ai: progressAIMaterialDescriptor,
  locale: progressLocaleMessages,
  ui: { palette: [{ id: 'progress', label: 'materials.progress.name', icon: IconProgress, group: paletteGroups.data, order: 4 }] },
}
