import type { MaterialModel } from '@easyink/plugin-api/material'
import { CHART_CUSTOM_CAPABILITIES, CHART_CUSTOM_TYPE, createChartCustomNode } from './schema'

export const chartCustomModel = {
  type: CHART_CUSTOM_TYPE,
  createDefaultNode: createChartCustomNode,
  capabilities: CHART_CUSTOM_CAPABILITIES,
  binding: {
    kind: 'ordinary',
    primaryProp: 'option',
    formatEditor: { tabs: ['custom'], defaultTab: 'custom' },
  },
} satisfies MaterialModel
