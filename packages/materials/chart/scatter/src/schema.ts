import type { MaterialNode } from '@easyink/schema'
import { canonicalizeMaterialNode } from '@easyink/schema'
import { convertUnit, generateId } from '@easyink/shared'

export const CHART_SCATTER_TYPE = 'chart-scatter'

export interface ChartScatterProps {
  pointColor: string
  backgroundColor: string
  axisColor: string
  labelColor: string
  showValueLabels: boolean
  showGrid: boolean
  showXAxisLabel: boolean
  showYAxisLabel: boolean
  showXAxisLine: boolean
  showYAxisLine: boolean
  symbolSize: number
}

export const CHART_SCATTER_DEFAULTS: ChartScatterProps = {
  pointColor: '#2563eb',
  backgroundColor: '',
  axisColor: '#6b7280',
  labelColor: '#374151',
  showValueLabels: false,
  showGrid: true,
  showXAxisLabel: true,
  showYAxisLabel: true,
  showXAxisLine: true,
  showYAxisLine: true,
  symbolSize: 7,
}

export const CHART_SCATTER_CAPABILITIES = {
  bindable: true,
  rotatable: true,
  resizable: true,
  supportsChildren: false,
  supportsAnimation: false,
  supportsUnionDrop: false,
  multiBinding: false,
}

export function createChartScatterNode(partial?: Partial<MaterialNode>, unit?: string): MaterialNode {
  const c = unit && unit !== 'mm' ? (value: number) => convertUnit(value, 'mm', unit) : (value: number) => value
  const partialNode = partial ? { ...partial } : undefined
  const partialModel = (partial?.model ?? {}) as Partial<ChartScatterProps>

  if (partialNode)
    delete partialNode.model

  return canonicalizeMaterialNode(CHART_SCATTER_TYPE, {
    id: generateId('charts'),
    type: CHART_SCATTER_TYPE,
    x: 0,
    y: 0,
    width: c(160),
    height: c(90),
    model: {
      ...CHART_SCATTER_DEFAULTS,
      ...partialModel,
    },
    ...partialNode,
  })
}
