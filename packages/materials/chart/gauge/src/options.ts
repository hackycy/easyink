import type { ChartGaugeValuePoint, GaugeChartStyleOptions } from '@easyink/material-chart-kernel'
import type { ChartGaugeProps } from './schema'
import { createGaugeEChartsOption } from '@easyink/material-chart-kernel'
import { CHART_GAUGE_DEFAULTS } from './schema'

export const DEFAULT_CHART_GAUGE_PREVIEW_DATA: ChartGaugeValuePoint[] = [
  { value: 72, name: CHART_GAUGE_DEFAULTS.defaultName, unit: CHART_GAUGE_DEFAULTS.defaultUnit },
]

export function createChartGaugePreviewOption(props: Partial<ChartGaugeProps>, dataInput?: unknown) {
  const resolved = resolveChartGaugeProps(props)
  const data = normalizeGaugeData(dataInput, DEFAULT_CHART_GAUGE_PREVIEW_DATA)
  return createGaugeEChartsOption(data, resolved)
}

export function createChartGaugeRuntimeOption(props: Partial<ChartGaugeProps>, dataInput?: unknown) {
  const resolved = resolveChartGaugeProps(props)
  const data = normalizeGaugeData(dataInput, [])
  return createGaugeEChartsOption(data, resolved)
}

export function createChartGaugeRuntimeOptionFromData(props: Partial<ChartGaugeProps>, data: ChartGaugeValuePoint[]) {
  return createGaugeEChartsOption(data, resolveChartGaugeProps(props))
}

export function resolveChartGaugeProps(props: Partial<ChartGaugeProps>): GaugeChartStyleOptions {
  return {
    minValue: normalizeNumber(props.minValue, CHART_GAUGE_DEFAULTS.minValue),
    maxValue: normalizeNumber(props.maxValue, CHART_GAUGE_DEFAULTS.maxValue),
    defaultName: normalizeText(props.defaultName, CHART_GAUGE_DEFAULTS.defaultName),
    defaultUnit: normalizeText(props.defaultUnit, CHART_GAUGE_DEFAULTS.defaultUnit),
    progressColor: props.progressColor || CHART_GAUGE_DEFAULTS.progressColor,
    trackColor: props.trackColor || CHART_GAUGE_DEFAULTS.trackColor,
    pointerColor: props.pointerColor || CHART_GAUGE_DEFAULTS.pointerColor,
    backgroundColor: props.backgroundColor || CHART_GAUGE_DEFAULTS.backgroundColor,
    labelColor: props.labelColor || CHART_GAUGE_DEFAULTS.labelColor,
    showPointer: props.showPointer !== false,
    showProgress: props.showProgress !== false,
    showTitle: props.showTitle !== false,
    showValue: props.showValue !== false,
  }
}

function normalizeGaugeData(input: unknown, fallback: ChartGaugeValuePoint[]): ChartGaugeValuePoint[] {
  const point = readGaugePoint(input)
  return point ? [point] : fallback
}

function readGaugePoint(input: unknown): ChartGaugeValuePoint | null {
  if (typeof input === 'number')
    return Number.isFinite(input) ? { value: input } : null
  if (typeof input === 'string' && input.trim() !== '') {
    const value = Number(input)
    return Number.isFinite(value) ? { value } : null
  }
  if (Array.isArray(input))
    return input.map(readGaugePoint).find((point): point is ChartGaugeValuePoint => !!point) ?? null
  if (!input || typeof input !== 'object')
    return null

  const record = input as Record<string, unknown>
  const rawValue = record.value ?? record.current ?? record.score ?? record.percent
  const value = typeof rawValue === 'number'
    ? rawValue
    : typeof rawValue === 'string' && rawValue.trim() !== ''
      ? Number(rawValue)
      : Number.NaN
  if (!Number.isFinite(value))
    return null
  return {
    value,
    ...(record.name == null || record.name === '' ? {} : { name: String(record.name) }),
    ...(record.unit == null || record.unit === '' ? {} : { unit: String(record.unit) }),
    ...(typeof record.color === 'string' ? { color: record.color } : {}),
  }
}

function normalizeNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : fallback
}

function normalizeText(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() !== ''
    ? value
    : fallback
}
