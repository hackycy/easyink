import type { ChartCategoryValuePoint, RadarChartStyleOptions } from '@easyink/material-chart-kernel'
import type { ChartRadarProps } from './schema'
import { createRadarEChartsOption, DEFAULT_CHART_PREVIEW_DATA, normalizeCategoryValueData } from '@easyink/material-chart-kernel'
import { CHART_RADAR_DEFAULTS } from './schema'

export function createChartRadarPreviewOption(props: Partial<ChartRadarProps>, dataInput?: unknown) {
  const resolved = resolveChartRadarProps(props)
  const data = normalizeCategoryValueData(dataInput, DEFAULT_CHART_PREVIEW_DATA)
  return createRadarEChartsOption(data, resolved)
}

export function createChartRadarRuntimeOption(props: Partial<ChartRadarProps>, dataInput?: unknown) {
  const resolved = resolveChartRadarProps(props)
  const data = normalizeCategoryValueData(dataInput, [])
  return createRadarEChartsOption(data, resolved)
}

export function createChartRadarRuntimeOptionFromData(props: Partial<ChartRadarProps>, data: ChartCategoryValuePoint[]) {
  return createRadarEChartsOption(data, resolveChartRadarProps(props))
}

export function resolveChartRadarProps(props: Partial<ChartRadarProps>): RadarChartStyleOptions {
  return {
    areaColor: props.areaColor || CHART_RADAR_DEFAULTS.areaColor,
    lineColor: props.lineColor || CHART_RADAR_DEFAULTS.lineColor,
    pointColor: props.pointColor || CHART_RADAR_DEFAULTS.pointColor,
    backgroundColor: props.backgroundColor || CHART_RADAR_DEFAULTS.backgroundColor,
    axisColor: props.axisColor || CHART_RADAR_DEFAULTS.axisColor,
    labelColor: props.labelColor || CHART_RADAR_DEFAULTS.labelColor,
    showValueLabels: props.showValueLabels === true,
    showAxisLabels: props.showAxisLabels !== false,
    showArea: props.showArea !== false,
    showPoints: props.showPoints !== false,
    maxValue: normalizeMaxValue(props.maxValue),
  }
}

function normalizeMaxValue(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : CHART_RADAR_DEFAULTS.maxValue
}
