import type { EChartsCoreOption } from 'echarts/core'

export interface ChartCategoryValuePoint {
  label: string
  value: number
  color?: string
}

export interface ChartMountHandle {
  update: (option: EChartsCoreOption) => void
  dispose: () => void
}

export interface BarChartStyleOptions {
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

export interface LineChartStyleOptions {
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

export interface PieChartStyleOptions {
  paletteColors: string[]
  backgroundColor: string
  labelColor: string
  showValueLabels: boolean
  showLegend: boolean
  innerRadiusPercent: number
}
