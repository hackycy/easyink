import type { DesignerMaterial } from '@easyink/plugin-api/ui'
import { IconPageNumber } from '@easyink/icons'
import { paletteGroups } from '@easyink/shared'
import { createPageNumberExtension } from './designer'
import { pageNumberLocaleMessages } from './locale'
import { pageNumberModel } from './material-model'
import { pageNumberDesignerPropSchemas } from './prop-schemas'

export const pageNumber: DesignerMaterial = {
  model: pageNumberModel,
  renderer: createPageNumberExtension,
  properties: pageNumberDesignerPropSchemas,
  locale: pageNumberLocaleMessages,
  ui: { palette: [{ id: 'pageNumber', label: 'materials.pageNumber.name', icon: IconPageNumber, group: paletteGroups.utility, order: 0 }] },
}
