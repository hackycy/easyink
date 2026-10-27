import type { MaterialModel } from '@easyink/plugin-api/material'
import { CHART_BAR_DATA_CONTRACT } from './data-contract'
import { CHART_BAR_CAPABILITIES, CHART_BAR_TYPE, createChartBarNode } from './schema'

export const chartBarModel = {
  type: CHART_BAR_TYPE,
  createDefaultNode: createChartBarNode,
  capabilities: CHART_BAR_CAPABILITIES,
  binding: {
    kind: 'data-contract',
    contract: CHART_BAR_DATA_CONTRACT,
    formatEditor: { tabs: ['custom'], defaultTab: 'custom' },
  },
} satisfies MaterialModel
