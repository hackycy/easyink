import { defineStandardMaterialManifest, recordSchemaAdapter } from '@easyink/core'
import { svgStarAIMaterialDescriptor } from './ai'
import { createSvgStarExtension } from './designer'
import { svgStarLocaleMessages } from './locale'
import { svgStarDesignerPropSchemas } from './prop-schemas'
import { createSvgStarNode, SVG_STAR_TYPE } from './schema'
import { renderSvgStar } from './viewer'

export const svgStarMaterialManifest = defineStandardMaterialManifest({
  type: SVG_STAR_TYPE,
  nameKey: 'materials.svgStar.name',
  category: 'svg',
  iconKey: 'svg-star',
  catalogOrder: 10,
  defaultNode: createSvgStarNode(),
  interaction: { rotatable: true, resizable: true },
  binding: { kind: 'none' },
  layout: { intrinsicSize: 'none', fragmentation: 'none', pageRepeat: 'none', overflow: 'clip' },
  properties: svgStarDesignerPropSchemas,
  schemaAdapter: recordSchemaAdapter(1),
  designerFactory: createSvgStarExtension,
  localeMessages: svgStarLocaleMessages,
  viewerExtension: { render: renderSvgStar },
  aiDescriptor: svgStarAIMaterialDescriptor,
})
