import type { MaterialNode } from '@easyink/schema'
import { convertUnit, generateId } from '@easyink/shared'

export const CHART_GAUGE_TYPE = 'chart-gauge'

export interface ChartGaugeProps {
  minValue: number
  maxValue: number
  defaultName: string
  defaultUnit: string
  progressColor: string
  trackColor: string
  pointerColor: string
  backgroundColor: string
  labelColor: string
  showPointer: boolean
  showProgress: boolean
  showTitle: boolean
  showValue: boolean
}

export const CHART_GAUGE_DEFAULTS: ChartGaugeProps = {
  minValue: 0,
  maxValue: 100,
  defaultName: 'KPI',
  defaultUnit: '%',
  progressColor: '#2f80ed',
  trackColor: '#e5e7eb',
  pointerColor: '#1f2937',
  backgroundColor: '#ffffff',
  labelColor: '#374151',
  showPointer: true,
  showProgress: true,
  showTitle: true,
  showValue: true,
}

export const CHART_GAUGE_CAPABILITIES = {
  bindable: true,
  rotatable: true,
  resizable: true,
  supportsChildren: false,
  supportsAnimation: false,
  supportsUnionDrop: false,
  multiBinding: false,
}

export function createChartGaugeNode(partial?: Partial<MaterialNode>, unit?: string): MaterialNode {
  const c = unit && unit !== 'mm' ? (value: number) => convertUnit(value, 'mm', unit) : (value: number) => value
  const partialNode = partial ? { ...partial } : undefined
  const partialProps = (partial?.props ?? {}) as Partial<ChartGaugeProps>

  if (partialNode)
    delete partialNode.props

  return {
    id: generateId('chartg'),
    type: CHART_GAUGE_TYPE,
    x: 0,
    y: 0,
    width: c(130),
    height: c(90),
    props: {
      ...CHART_GAUGE_DEFAULTS,
      ...partialProps,
    },
    ...partialNode,
  }
}
