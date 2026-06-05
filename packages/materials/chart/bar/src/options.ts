import type { BarChartStyleOptions, ChartCategoryValuePoint } from '@easyink/material-chart-kernel'
import type { ChartBarProps } from './schema'
import { createBarEChartsOption, DEFAULT_CHART_PREVIEW_DATA, normalizeCategoryValueData } from '@easyink/material-chart-kernel'
import { CHART_BAR_DEFAULTS } from './schema'

export function createChartBarPreviewOption(props: Partial<ChartBarProps>, dataInput?: unknown) {
  const resolved = resolveChartBarProps(props)
  const data = normalizeCategoryValueData(dataInput, DEFAULT_CHART_PREVIEW_DATA)
  return createBarEChartsOption(data, resolved)
}

export function createChartBarRuntimeOption(props: Partial<ChartBarProps>, dataInput?: unknown) {
  const resolved = resolveChartBarProps(props)
  const data = normalizeCategoryValueData(dataInput, [])
  return createBarEChartsOption(data, resolved)
}

export function createChartBarRuntimeOptionFromData(props: Partial<ChartBarProps>, data: ChartCategoryValuePoint[]) {
  return createBarEChartsOption(data, resolveChartBarProps(props))
}

export function resolveChartBarProps(props: Partial<ChartBarProps>): BarChartStyleOptions {
  return {
    barColor: props.barColor || CHART_BAR_DEFAULTS.barColor,
    backgroundColor: props.backgroundColor || CHART_BAR_DEFAULTS.backgroundColor,
    axisColor: props.axisColor || CHART_BAR_DEFAULTS.axisColor,
    labelColor: props.labelColor || CHART_BAR_DEFAULTS.labelColor,
    showValueLabels: props.showValueLabels === true,
    showGrid: props.showGrid !== false,
    showXAxisLabel: props.showXAxisLabel !== false,
    showYAxisLabel: props.showYAxisLabel !== false,
    showXAxisLine: props.showXAxisLine !== false,
    showYAxisLine: props.showYAxisLine !== false,
  }
}
