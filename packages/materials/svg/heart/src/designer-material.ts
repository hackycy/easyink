import type { DesignerMaterial } from '@easyink/plugin-api/ui'
import { IconHeart } from '@easyink/icons'
import { paletteGroups } from '@easyink/shared'
import { createSvgHeartExtension } from './designer'
import { svgHeartLocaleMessages } from './locale'
import { svgHeartModel } from './material-model'
import { svgHeartDesignerPropSchemas } from './prop-schemas'

export const svgHeart: DesignerMaterial = {
  model: svgHeartModel,
  renderer: createSvgHeartExtension,
  properties: svgHeartDesignerPropSchemas,
  locale: svgHeartLocaleMessages,
  ui: { palette: [{ id: 'svgHeart', label: 'materials.svgHeart.name', icon: IconHeart, group: paletteGroups.svg, order: 1 }] },
}
