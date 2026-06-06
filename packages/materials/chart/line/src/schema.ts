import type { MaterialNode } from '@easyink/schema'
import { convertUnit, generateId } from '@easyink/shared'

export const CHART_LINE_TYPE = 'chart-line'

export interface ChartLineProps {
  lineColor: string
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
  showPoints: boolean
  smooth: boolean
}

export const CHART_LINE_DEFAULTS: ChartLineProps = {
  lineColor: '#14b8a6',
  pointColor: '#0f766e',
  backgroundColor: '#ffffff',
  axisColor: '#6b7280',
  labelColor: '#374151',
  showValueLabels: false,
  showGrid: true,
  showXAxisLabel: true,
  showYAxisLabel: true,
  showXAxisLine: true,
  showYAxisLine: true,
  showPoints: true,
  smooth: false,
}

export const CHART_LINE_CAPABILITIES = {
  bindable: true,
  rotatable: true,
  resizable: true,
  supportsChildren: false,
  supportsAnimation: false,
  supportsUnionDrop: false,
  multiBinding: false,
}

export function createChartLineNode(partial?: Partial<MaterialNode>, unit?: string): MaterialNode {
  const c = unit && unit !== 'mm' ? (value: number) => convertUnit(value, 'mm', unit) : (value: number) => value
  const partialNode = partial ? { ...partial } : undefined
  const partialProps = (partial?.props ?? {}) as Partial<ChartLineProps>

  if (partialNode)
    delete partialNode.props

  return {
    id: generateId('chartl'),
    type: CHART_LINE_TYPE,
    x: 0,
    y: 0,
    width: c(160),
    height: c(90),
    props: {
      ...CHART_LINE_DEFAULTS,
      ...partialProps,
    },
    ...partialNode,
  }
}
