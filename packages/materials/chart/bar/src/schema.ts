import type { MaterialNode } from '@easyink/schema'
import { convertUnit, generateId } from '@easyink/shared'

export const CHART_BAR_TYPE = 'chart-bar'

export interface ChartBarProps {
  barColor: string
  backgroundColor: string
  axisColor: string
  labelColor: string
  showValueLabels: boolean
  showGrid: boolean
  showXAxisLabel: boolean
  showYAxisLabel: boolean
  showXAxisLine: boolean
  showYAxisLine: boolean
}

export const CHART_BAR_DEFAULTS: ChartBarProps = {
  barColor: '#2f80ed',
  backgroundColor: '#ffffff',
  axisColor: '#6b7280',
  labelColor: '#374151',
  showValueLabels: false,
  showGrid: true,
  showXAxisLabel: true,
  showYAxisLabel: true,
  showXAxisLine: true,
  showYAxisLine: true,
}

export const CHART_BAR_CAPABILITIES = {
  bindable: true,
  rotatable: false,
  resizable: true,
  supportsChildren: false,
  supportsAnimation: false,
  supportsUnionDrop: false,
  multiBinding: false,
}

export function createChartBarNode(partial?: Partial<MaterialNode>, unit?: string): MaterialNode {
  const c = unit && unit !== 'mm' ? (value: number) => convertUnit(value, 'mm', unit) : (value: number) => value
  const partialNode = partial ? { ...partial } : undefined
  const partialProps = (partial?.props ?? {}) as Partial<ChartBarProps>

  if (partialNode)
    delete partialNode.props

  return {
    id: generateId('chartb'),
    type: CHART_BAR_TYPE,
    x: 0,
    y: 0,
    width: c(160),
    height: c(90),
    props: {
      ...CHART_BAR_DEFAULTS,
      ...partialProps,
    },
    ...partialNode,
  }
}
