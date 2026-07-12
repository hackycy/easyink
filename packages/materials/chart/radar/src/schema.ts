import type { MaterialNode } from '@easyink/schema'
import { canonicalizeMaterialNode } from '@easyink/schema'
import { convertUnit, generateId } from '@easyink/shared'

export const CHART_RADAR_TYPE = 'chart-radar'

export interface ChartRadarProps {
  areaColor: string
  lineColor: string
  pointColor: string
  backgroundColor: string
  axisColor: string
  labelColor: string
  showValueLabels: boolean
  showAxisLabels: boolean
  showArea: boolean
  showPoints: boolean
  maxValue: number
}

export const CHART_RADAR_DEFAULTS: ChartRadarProps = {
  areaColor: '#93c5fd',
  lineColor: '#2563eb',
  pointColor: '#1d4ed8',
  backgroundColor: '',
  axisColor: '#cbd5e1',
  labelColor: '#374151',
  showValueLabels: false,
  showAxisLabels: true,
  showArea: true,
  showPoints: true,
  maxValue: 100,
}

export const CHART_RADAR_CAPABILITIES = {
  bindable: true,
  rotatable: true,
  resizable: true,
  supportsChildren: false,
  supportsAnimation: false,
  supportsUnionDrop: false,
  multiBinding: false,
}

export function createChartRadarNode(partial?: Partial<MaterialNode>, unit?: string): MaterialNode {
  const c = unit && unit !== 'mm' ? (value: number) => convertUnit(value, 'mm', unit) : (value: number) => value
  const partialNode = partial ? { ...partial } : undefined
  const partialModel = (partial?.model ?? {}) as Partial<ChartRadarProps>

  if (partialNode)
    delete partialNode.model

  return canonicalizeMaterialNode(CHART_RADAR_TYPE, {
    id: generateId('chartr'),
    type: CHART_RADAR_TYPE,
    x: 0,
    y: 0,
    width: c(120),
    height: c(100),
    model: {
      ...CHART_RADAR_DEFAULTS,
      ...partialModel,
    },
    ...partialNode,
  })
}
