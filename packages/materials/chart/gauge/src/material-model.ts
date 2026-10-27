import type { MaterialModel } from '@easyink/plugin-api/material'
import { CHART_GAUGE_DATA_CONTRACT } from './data-contract'
import { CHART_GAUGE_CAPABILITIES, CHART_GAUGE_TYPE, createChartGaugeNode } from './schema'

export const chartGaugeModel = {
  type: CHART_GAUGE_TYPE,
  createDefaultNode: createChartGaugeNode,
  capabilities: CHART_GAUGE_CAPABILITIES,
  binding: {
    kind: 'data-contract',
    contract: CHART_GAUGE_DATA_CONTRACT,
    formatEditor: { tabs: ['custom'], defaultTab: 'custom' },
  },
} satisfies MaterialModel
