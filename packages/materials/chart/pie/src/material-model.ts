import type { MaterialModel } from '@easyink/plugin-api/material'
import { CHART_PIE_DATA_CONTRACT } from './data-contract'
import { CHART_PIE_CAPABILITIES, CHART_PIE_TYPE, createChartPieNode } from './schema'

export const chartPieModel = {
  type: CHART_PIE_TYPE,
  createDefaultNode: createChartPieNode,
  capabilities: CHART_PIE_CAPABILITIES,
  binding: {
    kind: 'data-contract',
    contract: CHART_PIE_DATA_CONTRACT,
    formatEditor: { tabs: ['custom'], defaultTab: 'custom' },
  },
} satisfies MaterialModel
