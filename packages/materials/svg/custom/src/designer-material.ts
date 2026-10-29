import type { DesignerMaterial } from '@easyink/plugin-api/ui'
import { IconSvg } from '@easyink/icons'
import { paletteGroups } from '@easyink/shared'
import { createSvgCustomExtension } from './designer'
import { svgCustomLocaleMessages } from './locale'
import { svgCustomModel } from './material-model'
import { svgCustomDesignerPropSchemas } from './prop-schemas'

export const svgCustom: DesignerMaterial = {
  model: svgCustomModel,
  renderer: createSvgCustomExtension,
  properties: svgCustomDesignerPropSchemas,
  locale: svgCustomLocaleMessages,
  ui: { palette: [{ id: 'svgCustom', label: 'materials.svgCustom.name', icon: IconSvg, group: paletteGroups.svg, order: 2 }] },
}
