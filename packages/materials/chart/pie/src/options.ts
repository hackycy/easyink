import type { ChartCategoryValuePoint, PieChartStyleOptions } from '@easyink/material-chart-kernel'
import type { ChartPiePalettePreset, ChartPieProps } from './schema'
import { createPieEChartsOption, DEFAULT_CHART_PREVIEW_DATA, normalizeCategoryValueData } from '@easyink/material-chart-kernel'
import { CHART_PIE_DEFAULTS } from './schema'

export const CHART_PIE_PALETTES: Record<ChartPiePalettePreset, string[]> = {
  classic: ['#2f80ed', '#14b8a6', '#f59e0b', '#ef4444', '#8b5cf6', '#64748b'],
  business: ['#2563eb', '#0f766e', '#475569', '#9333ea', '#ca8a04', '#dc2626'],
  pastel: ['#93c5fd', '#99f6e4', '#fde68a', '#fecaca', '#ddd6fe', '#cbd5e1'],
}

export function createChartPiePreviewOption(props: Partial<ChartPieProps>, dataInput?: unknown) {
  const resolved = resolveChartPieProps(props)
  const data = normalizeCategoryValueData(dataInput, DEFAULT_CHART_PREVIEW_DATA)
  return createPieEChartsOption(data, resolved)
}

export function createChartPieRuntimeOption(props: Partial<ChartPieProps>, dataInput?: unknown) {
  const resolved = resolveChartPieProps(props)
  const data = normalizeCategoryValueData(dataInput, [])
  return createPieEChartsOption(data, resolved)
}

export function createChartPieRuntimeOptionFromData(props: Partial<ChartPieProps>, data: ChartCategoryValuePoint[]) {
  return createPieEChartsOption(data, resolveChartPieProps(props))
}

export function resolveChartPieProps(props: Partial<ChartPieProps>): PieChartStyleOptions {
  return {
    paletteColors: CHART_PIE_PALETTES[resolvePalettePreset(props.palettePreset)],
    backgroundColor: props.backgroundColor || CHART_PIE_DEFAULTS.backgroundColor,
    labelColor: props.labelColor || CHART_PIE_DEFAULTS.labelColor,
    showValueLabels: props.showValueLabels !== false,
    showLegend: props.showLegend !== false,
    innerRadiusPercent: normalizeInnerRadius(props.innerRadiusPercent),
  }
}

function resolvePalettePreset(value: unknown): ChartPiePalettePreset {
  return value === 'business' || value === 'pastel' || value === 'classic'
    ? value
    : CHART_PIE_DEFAULTS.palettePreset
}

function normalizeInnerRadius(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : CHART_PIE_DEFAULTS.innerRadiusPercent
}
