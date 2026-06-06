import type { ChartScatterPoint, ScatterChartStyleOptions } from '@easyink/material-chart-kernel'
import type { ChartScatterProps } from './schema'
import { createScatterEChartsOption, DEFAULT_SCATTER_PREVIEW_DATA, normalizeScatterData } from '@easyink/material-chart-kernel'
import { CHART_SCATTER_DEFAULTS } from './schema'

export function createChartScatterPreviewOption(props: Partial<ChartScatterProps>, dataInput?: unknown) {
  const resolved = resolveChartScatterProps(props)
  const data = normalizeScatterData(dataInput, DEFAULT_SCATTER_PREVIEW_DATA)
  return createScatterEChartsOption(data, resolved)
}

export function createChartScatterRuntimeOption(props: Partial<ChartScatterProps>, dataInput?: unknown) {
  const resolved = resolveChartScatterProps(props)
  const data = normalizeScatterData(dataInput, [])
  return createScatterEChartsOption(data, resolved)
}

export function createChartScatterRuntimeOptionFromData(props: Partial<ChartScatterProps>, data: ChartScatterPoint[]) {
  return createScatterEChartsOption(data, resolveChartScatterProps(props))
}

export function resolveChartScatterProps(props: Partial<ChartScatterProps>): ScatterChartStyleOptions {
  return {
    pointColor: props.pointColor || CHART_SCATTER_DEFAULTS.pointColor,
    backgroundColor: props.backgroundColor || CHART_SCATTER_DEFAULTS.backgroundColor,
    axisColor: props.axisColor || CHART_SCATTER_DEFAULTS.axisColor,
    labelColor: props.labelColor || CHART_SCATTER_DEFAULTS.labelColor,
    showValueLabels: props.showValueLabels === true,
    showGrid: props.showGrid !== false,
    showXAxisLabel: props.showXAxisLabel !== false,
    showYAxisLabel: props.showYAxisLabel !== false,
    showXAxisLine: props.showXAxisLine !== false,
    showYAxisLine: props.showYAxisLine !== false,
    symbolSize: normalizeSymbolSize(props.symbolSize),
  }
}

function normalizeSymbolSize(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value))
    return CHART_SCATTER_DEFAULTS.symbolSize
  return value
}
