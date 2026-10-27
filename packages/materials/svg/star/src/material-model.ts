import type { MaterialModel } from '@easyink/plugin-api/material'
import { createSvgStarNode, SVG_STAR_CAPABILITIES, SVG_STAR_TYPE } from './schema'

export const svgStarModel = {
  type: SVG_STAR_TYPE,
  createDefaultNode: createSvgStarNode,
  capabilities: SVG_STAR_CAPABILITIES,
  binding: { kind: 'none' },
} satisfies MaterialModel
