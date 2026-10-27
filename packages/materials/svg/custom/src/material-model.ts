import type { MaterialModel } from '@easyink/plugin-api/material'
import { createSvgCustomNode, SVG_CUSTOM_CAPABILITIES, SVG_CUSTOM_TYPE } from './schema'

export const svgCustomModel = {
  type: SVG_CUSTOM_TYPE,
  createDefaultNode: createSvgCustomNode,
  capabilities: SVG_CUSTOM_CAPABILITIES,
  binding: { kind: 'ordinary', primaryProp: 'content', formatEditor: { tabs: ['custom'], defaultTab: 'custom' } },
} satisfies MaterialModel
