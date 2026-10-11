import type { MaterialModel } from '@easyink/plugin-api/material'
import { CHART_SCATTER_DATA_CONTRACT } from './data-contract'
import { CHART_SCATTER_CAPABILITIES, CHART_SCATTER_TYPE, createChartScatterNode } from './schema'

export const chartScatterModel = {
  type: CHART_SCATTER_TYPE,
  createDefaultNode: createChartScatterNode,
  capabilities: CHART_SCATTER_CAPABILITIES,
  binding: {
    kind: 'data-contract',
    contract: CHART_SCATTER_DATA_CONTRACT,
    formatEditor: { tabs: ['custom'], defaultTab: 'custom' },
  },
} satisfies MaterialModel
