import type { ChartCategoryValuePoint, PieChartStyleOptions } from '@easyink/material-chart-kernel'
import type { ChartPiePalettePreset, ChartPieProps } from './schema'
import { createPieEChartsOption, DEFAULT_CHART_PREVIEW_DATA, normalizeCategoryValueData } from '@easyink/material-chart-kernel'
import { CHART_PIE_DEFAULTS } from './schema'

export const CHART_PIE_PALETTE_OPTIONS: Array<{ label: string, value: ChartPiePalettePreset }> = [
  { label: 'materials.chartPie.option.paletteProduct', value: 'product' },
  { label: 'materials.chartPie.option.palettePrimer', value: 'primer' },
  { label: 'materials.chartPie.option.paletteAtlassian', value: 'atlassian' },
  { label: 'materials.chartPie.option.paletteSpectrum', value: 'spectrum' },
  { label: 'materials.chartPie.option.paletteMint', value: 'mint' },
  { label: 'materials.chartPie.option.paletteSunset', value: 'sunset' },
  { label: 'materials.chartPie.option.paletteAurora', value: 'aurora' },
  { label: 'materials.chartPie.option.paletteEarth', value: 'earth' },
  { label: 'materials.chartPie.option.paletteMono', value: 'mono' },
]

export const CHART_PIE_PALETTES: Record<ChartPiePalettePreset, string[]> = {
  product: ['#2563eb', '#14b8a6', '#f59e0b', '#f97316', '#8b5cf6', '#64748b'],
  primer: ['#0969da', '#1a7f37', '#bf8700', '#cf222e', '#8250df', '#57606a'],
  atlassian: ['#0c66e4', '#22a06b', '#f5cd47', '#e56910', '#af59e1', '#626f86'],
  spectrum: ['#007aff', '#34c759', '#ff9500', '#ff3b30', '#af52de', '#5e5ce6'],
  mint: ['#0f766e', '#10b981', '#84cc16', '#eab308', '#06b6d4', '#475569'],
  sunset: ['#dc2626', '#f97316', '#f59e0b', '#ec4899', '#7c3aed', '#334155'],
  aurora: ['#0891b2', '#2563eb', '#7c3aed', '#db2777', '#059669', '#475569'],
  earth: ['#0f766e', '#65a30d', '#ca8a04', '#a16207', '#92400e', '#57534e'],
  mono: ['#111827', '#374151', '#6b7280', '#9ca3af', '#d1d5db', '#f3f4f6'],
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
    sectorGapAngle: normalizeSectorGapAngle(props.sectorGapAngle),
    sectorCornerRadius: normalizeSectorCornerRadius(props.sectorCornerRadius),
  }
}

function resolvePalettePreset(value: unknown): ChartPiePalettePreset {
  return isChartPiePalettePreset(value) ? value : CHART_PIE_DEFAULTS.palettePreset
}

function isChartPiePalettePreset(value: unknown): value is ChartPiePalettePreset {
  return typeof value === 'string' && Object.hasOwn(CHART_PIE_PALETTES, value)
}

function normalizeInnerRadius(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : CHART_PIE_DEFAULTS.innerRadiusPercent
}

function normalizeSectorGapAngle(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : CHART_PIE_DEFAULTS.sectorGapAngle
}

function normalizeSectorCornerRadius(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : CHART_PIE_DEFAULTS.sectorCornerRadius
}
