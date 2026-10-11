import type { MaterialModel } from '@easyink/plugin-api/material'
import { CHART_LINE_DATA_CONTRACT } from './data-contract'
import { CHART_LINE_CAPABILITIES, CHART_LINE_TYPE, createChartLineNode } from './schema'

export const chartLineModel = {
  type: CHART_LINE_TYPE,
  createDefaultNode: createChartLineNode,
  capabilities: CHART_LINE_CAPABILITIES,
  binding: {
    kind: 'data-contract',
    contract: CHART_LINE_DATA_CONTRACT,
    formatEditor: { tabs: ['custom'], defaultTab: 'custom' },
  },
} satisfies MaterialModel
