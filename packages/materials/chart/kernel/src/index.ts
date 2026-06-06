import type { BarSeriesOption, LineSeriesOption, PieSeriesOption } from 'echarts/charts'
import type { EChartsCoreOption } from 'echarts/core'
import { BarChart, LineChart, PieChart } from 'echarts/charts'
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components'
import { init, use } from 'echarts/core'
import { SVGRenderer } from 'echarts/renderers'

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

export const DEFAULT_CHART_PREVIEW_DATA: ChartCategoryValuePoint[] = [
  { label: 'A', value: 32 },
  { label: 'B', value: 56 },
  { label: 'C', value: 41 },
  { label: 'D', value: 72 },
  { label: 'E', value: 48 },
]

const PREFERRED_LABEL_KEYS = ['label', 'name', 'category', 'x', 'title']
const PREFERRED_VALUE_KEYS = ['value', 'y', 'amount', 'count', 'total', 'qty', 'quantity']

let echartsRegistered = false

export function ensureEChartsRegistered(): void {
  if (echartsRegistered)
    return
  use([BarChart, LineChart, PieChart, GridComponent, LegendComponent, TooltipComponent, SVGRenderer])
  echartsRegistered = true
}

export function normalizeCategoryValueData(input: unknown, fallback: ChartCategoryValuePoint[] = DEFAULT_CHART_PREVIEW_DATA): ChartCategoryValuePoint[] {
  const result = readCategoryValueData(input)
  return result.length > 0 ? result : fallback
}

export function createBarEChartsOption(data: ChartCategoryValuePoint[], style: BarChartStyleOptions): EChartsCoreOption {
  const categories = data.map(point => point.label)
  const values = data.map(point => point.value)
  const series: BarSeriesOption = {
    type: 'bar',
    data: values,
    itemStyle: {
      color: style.barColor || '#2f80ed',
    },
    label: {
      show: style.showValueLabels,
      position: 'top',
      color: style.labelColor || '#1f2937',
      fontSize: 10,
    },
  }

  return {
    animation: false,
    backgroundColor: style.backgroundColor || 'transparent',
    grid: {
      top: style.showValueLabels ? 18 : 8,
      right: 10,
      bottom: style.showXAxisLabel ? 24 : 8,
      left: style.showYAxisLabel ? 32 : 10,
      containLabel: false,
    },
    tooltip: {
      show: false,
    },
    xAxis: {
      type: 'category',
      data: categories,
      axisLine: { show: style.showXAxisLine, lineStyle: { color: style.axisColor || '#6b7280' } },
      axisTick: { show: false },
      axisLabel: { show: style.showXAxisLabel, color: style.labelColor || '#374151', fontSize: 10 },
    },
    yAxis: {
      type: 'value',
      splitLine: {
        show: style.showGrid,
        lineStyle: { color: '#e5e7eb' },
      },
      axisLine: { show: style.showYAxisLine, lineStyle: { color: style.axisColor || '#6b7280' } },
      axisTick: { show: false },
      axisLabel: { show: style.showYAxisLabel, color: style.labelColor || '#374151', fontSize: 10 },
    },
    series: [series],
  }
}

export function createLineEChartsOption(data: ChartCategoryValuePoint[], style: LineChartStyleOptions): EChartsCoreOption {
  const categories = data.map(point => point.label)
  const values = data.map(point => point.value)
  const series: LineSeriesOption = {
    type: 'line',
    data: values,
    smooth: style.smooth,
    showSymbol: style.showPoints,
    symbolSize: 6,
    lineStyle: {
      color: style.lineColor || '#14b8a6',
      width: 2,
    },
    itemStyle: {
      color: style.pointColor || style.lineColor || '#14b8a6',
    },
    label: {
      show: style.showValueLabels,
      position: 'top',
      color: style.labelColor || '#1f2937',
      fontSize: 10,
    },
  }

  return {
    animation: false,
    backgroundColor: style.backgroundColor || 'transparent',
    grid: {
      top: style.showValueLabels ? 18 : 8,
      right: 10,
      bottom: style.showXAxisLabel ? 24 : 8,
      left: style.showYAxisLabel ? 32 : 10,
      containLabel: false,
    },
    tooltip: {
      show: false,
    },
    xAxis: {
      type: 'category',
      data: categories,
      axisLine: { show: style.showXAxisLine, lineStyle: { color: style.axisColor || '#6b7280' } },
      axisTick: { show: false },
      axisLabel: { show: style.showXAxisLabel, color: style.labelColor || '#374151', fontSize: 10 },
    },
    yAxis: {
      type: 'value',
      splitLine: {
        show: style.showGrid,
        lineStyle: { color: '#e5e7eb' },
      },
      axisLine: { show: style.showYAxisLine, lineStyle: { color: style.axisColor || '#6b7280' } },
      axisTick: { show: false },
      axisLabel: { show: style.showYAxisLabel, color: style.labelColor || '#374151', fontSize: 10 },
    },
    series: [series],
  }
}

export function createPieEChartsOption(data: ChartCategoryValuePoint[], style: PieChartStyleOptions): EChartsCoreOption {
  const series: PieSeriesOption = {
    type: 'pie',
    radius: [`${clamp(style.innerRadiusPercent, 0, 80)}%`, '72%'],
    center: ['50%', style.showLegend ? '44%' : '50%'],
    avoidLabelOverlap: true,
    data: data.map(point => createPieDataItem(point)),
    label: {
      show: style.showValueLabels,
      color: style.labelColor || '#1f2937',
      fontSize: 10,
      formatter: '{b}: {c}',
    },
    labelLine: {
      show: style.showValueLabels,
      length: 8,
      length2: 6,
    },
  }

  return {
    animation: false,
    color: style.paletteColors.length > 0 ? style.paletteColors : undefined,
    backgroundColor: style.backgroundColor || 'transparent',
    tooltip: {
      show: false,
    },
    legend: {
      show: style.showLegend,
      type: 'plain',
      bottom: 0,
      left: 'center',
      itemWidth: 8,
      itemHeight: 8,
      textStyle: {
        color: style.labelColor || '#374151',
        fontSize: 10,
      },
    },
    series: [series],
  }
}

function createPieDataItem(point: ChartCategoryValuePoint): NonNullable<PieSeriesOption['data']>[number] {
  const item: NonNullable<PieSeriesOption['data']>[number] = {
    name: point.label,
    value: point.value,
  }
  if (point.color) {
    item.itemStyle = {
      color: point.color,
    }
  }
  return item
}

export function mountECharts(container: HTMLElement, option: EChartsCoreOption): ChartMountHandle {
  ensureEChartsRegistered()
  prepareChartContainer(container)
  const chart = init(container, undefined, { renderer: 'svg' })
  chart.setOption(option, true)

  let frame = requestResize(chart)
  let observer: ResizeObserver | undefined
  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(() => {
      frame = requestResize(chart, frame)
    })
    observer.observe(container)
  }

  return {
    update(nextOption) {
      chart.setOption(nextOption, true)
      frame = requestResize(chart, frame)
    },
    dispose() {
      if (frame !== undefined && typeof cancelAnimationFrame !== 'undefined')
        cancelAnimationFrame(frame)
      observer?.disconnect()
      chart.dispose()
    },
  }
}

export function renderEChartsSvg(option: EChartsCoreOption, width: number, height: number): string {
  ensureEChartsRegistered()
  const chart = init(null, undefined, {
    renderer: 'svg',
    ssr: true,
    width: Math.max(1, Math.round(width)),
    height: Math.max(1, Math.round(height)),
  })
  chart.setOption(option, true)
  const svg = chart.renderToSVGString()
  chart.dispose()
  return svg
}

function readCategoryValueData(input: unknown): ChartCategoryValuePoint[] {
  if (Array.isArray(input))
    return readArrayData(input)

  if (isRecord(input)) {
    const categories = input.categories
    const values = input.values
    if (Array.isArray(categories) && Array.isArray(values)) {
      return categories
        .map((label, index) => toPoint(label, values[index]))
        .filter((point): point is ChartCategoryValuePoint => !!point)
    }

    const entries = Object.entries(input)
    return entries
      .map(([label, value]) => toPoint(label, value))
      .filter((point): point is ChartCategoryValuePoint => !!point)
  }

  return []
}

function readArrayData(input: unknown[]): ChartCategoryValuePoint[] {
  return input
    .map((item, index) => {
      if (typeof item === 'number')
        return toPoint(`Item ${index + 1}`, item)
      if (!isRecord(item))
        return null

      const labelKey = findKey(item, PREFERRED_LABEL_KEYS, value => typeof value === 'string' || typeof value === 'number')
      const valueKey = findKey(item, PREFERRED_VALUE_KEYS, value => typeof value === 'number' || isNumericString(value))
      const looseValueKey = valueKey ?? Object.keys(item).find(key => typeof item[key] === 'number' || isNumericString(item[key]))
      if (!looseValueKey)
        return null

      const label = labelKey ? item[labelKey] : `Item ${index + 1}`
      return toPoint(label, item[looseValueKey])
    })
    .filter((point): point is ChartCategoryValuePoint => !!point)
}

function findKey(record: Record<string, unknown>, keys: string[], predicate: (value: unknown) => boolean): string | undefined {
  for (const key of keys) {
    if (predicate(record[key]))
      return key
  }
  return undefined
}

function toPoint(label: unknown, value: unknown): ChartCategoryValuePoint | null {
  const numericValue = typeof value === 'number' ? value : isNumericString(value) ? Number(value) : Number.NaN
  if (!Number.isFinite(numericValue))
    return null
  return {
    label: label == null || label === '' ? 'Item' : String(label),
    value: numericValue,
  }
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value))
    return min
  return Math.min(max, Math.max(min, value))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNumericString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))
}

function prepareChartContainer(container: HTMLElement): void {
  container.style.width = '100%'
  container.style.height = '100%'
  container.style.minWidth = '1px'
  container.style.minHeight = '1px'
}

function requestResize(chart: ReturnType<typeof init>, currentFrame?: number): number | undefined {
  if (currentFrame !== undefined && typeof cancelAnimationFrame !== 'undefined')
    cancelAnimationFrame(currentFrame)
  if (typeof requestAnimationFrame === 'undefined') {
    chart.resize()
    return undefined
  }
  return requestAnimationFrame(() => chart.resize())
}
