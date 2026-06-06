import type { ChartCategoryValuePoint, LineChartStyleOptions } from '@easyink/material-chart-kernel'
import type { ChartLineProps } from './schema'
import { createLineEChartsOption, DEFAULT_CHART_PREVIEW_DATA, normalizeCategoryValueData } from '@easyink/material-chart-kernel'
import { CHART_LINE_DEFAULTS } from './schema'

export function createChartLinePreviewOption(props: Partial<ChartLineProps>, dataInput?: unknown) {
  const resolved = resolveChartLineProps(props)
  const data = normalizeCategoryValueData(dataInput, DEFAULT_CHART_PREVIEW_DATA)
  return createLineEChartsOption(data, resolved)
}

export function createChartLineRuntimeOption(props: Partial<ChartLineProps>, dataInput?: unknown) {
  const resolved = resolveChartLineProps(props)
  const data = normalizeCategoryValueData(dataInput, [])
  return createLineEChartsOption(data, resolved)
}

export function createChartLineRuntimeOptionFromData(props: Partial<ChartLineProps>, data: ChartCategoryValuePoint[]) {
  return createLineEChartsOption(data, resolveChartLineProps(props))
}

export function resolveChartLineProps(props: Partial<ChartLineProps>): LineChartStyleOptions {
  return {
    lineColor: props.lineColor || CHART_LINE_DEFAULTS.lineColor,
    pointColor: props.pointColor || CHART_LINE_DEFAULTS.pointColor,
    backgroundColor: props.backgroundColor || CHART_LINE_DEFAULTS.backgroundColor,
    axisColor: props.axisColor || CHART_LINE_DEFAULTS.axisColor,
    labelColor: props.labelColor || CHART_LINE_DEFAULTS.labelColor,
    showValueLabels: props.showValueLabels === true,
    showGrid: props.showGrid !== false,
    showXAxisLabel: props.showXAxisLabel !== false,
    showYAxisLabel: props.showYAxisLabel !== false,
    showXAxisLine: props.showXAxisLine !== false,
    showYAxisLine: props.showYAxisLine !== false,
    showPoints: props.showPoints !== false,
    smooth: props.smooth === true,
  }
}
