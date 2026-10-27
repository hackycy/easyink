import type { MaterialModel } from '@easyink/plugin-api/material'
import { createSvgHeartNode, SVG_HEART_CAPABILITIES, SVG_HEART_TYPE } from './schema'

export const svgHeartModel = {
  type: SVG_HEART_TYPE,
  createDefaultNode: createSvgHeartNode,
  capabilities: SVG_HEART_CAPABILITIES,
  binding: { kind: 'none' },
} satisfies MaterialModel
