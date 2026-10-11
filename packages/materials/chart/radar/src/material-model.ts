import type { MaterialModel } from '@easyink/plugin-api/material'
import { CHART_RADAR_DATA_CONTRACT } from './data-contract'
import { CHART_RADAR_CAPABILITIES, CHART_RADAR_TYPE, createChartRadarNode } from './schema'

export const chartRadarModel = {
  type: CHART_RADAR_TYPE,
  createDefaultNode: createChartRadarNode,
  capabilities: CHART_RADAR_CAPABILITIES,
  binding: {
    kind: 'data-contract',
    contract: CHART_RADAR_DATA_CONTRACT,
    formatEditor: { tabs: ['custom'], defaultTab: 'custom' },
  },
} satisfies MaterialModel
