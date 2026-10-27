import type { DesignerMaterial } from '@easyink/plugin-api/ui'
import { IconStar } from '@easyink/icons'
import { paletteGroups } from '@easyink/shared'
import { svgStarAIMaterialDescriptor } from './ai'
import { createSvgStarExtension } from './designer'
import { svgStarLocaleMessages } from './locale'
import { svgStarModel } from './material-model'
import { svgStarDesignerPropSchemas } from './prop-schemas'

export const svgStar: DesignerMaterial = {
  model: svgStarModel,
  renderer: createSvgStarExtension,
  properties: svgStarDesignerPropSchemas,
  ai: svgStarAIMaterialDescriptor,
  locale: svgStarLocaleMessages,
  ui: { palette: [{ id: 'svgStar', label: 'materials.svgStar.name', icon: IconStar, group: paletteGroups.svg, order: 0 }] },
}
