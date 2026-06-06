import type { EChartsCoreOption } from 'echarts/core'

export interface ChartCategoryValuePoint {
  label: string
  value: number
  color?: string
}

export interface ChartScatterPoint {
  x: number
  y: number
  label?: string
  color?: string
}

export interface ChartGaugeValuePoint {
  value: number
  name?: string
  unit?: string
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

export interface ScatterChartStyleOptions {
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

export interface PieChartStyleOptions {
  paletteColors: string[]
  backgroundColor: string
  labelColor: string
  showValueLabels: boolean
  showLegend: boolean
  innerRadiusPercent: number
  sectorGapAngle: number
  sectorCornerRadius: number
}

export interface GaugeChartStyleOptions {
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

export interface RadarChartStyleOptions {
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
