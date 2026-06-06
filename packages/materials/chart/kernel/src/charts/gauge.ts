import type { GaugeSeriesOption } from 'echarts/charts'
import type { EChartsCoreOption } from 'echarts/core'
import type { ChartGaugeValuePoint, GaugeChartStyleOptions } from '../types'
import { clamp } from '../utils'

export function createGaugeEChartsOption(data: ChartGaugeValuePoint[], style: GaugeChartStyleOptions): EChartsCoreOption {
  const range = normalizeRange(style.minValue, style.maxValue)
  const point = data.find(item => Number.isFinite(item.value))
  const unit = point?.unit ?? style.defaultUnit
  const progressColor = point?.color || style.progressColor

  const series: GaugeSeriesOption = {
    type: 'gauge',
    min: range.min,
    max: range.max,
    startAngle: 210,
    endAngle: -30,
    radius: '92%',
    center: ['50%', '56%'],
    progress: {
      show: style.showProgress,
      width: 10,
      itemStyle: {
        color: progressColor,
      },
    },
    axisLine: {
      lineStyle: {
        width: 10,
        color: [[1, style.trackColor]],
      },
    },
    pointer: {
      show: style.showPointer,
      length: '58%',
      width: 4,
      itemStyle: {
        color: style.pointerColor || progressColor,
      },
    },
    anchor: {
      show: style.showPointer,
      size: 7,
      itemStyle: {
        color: style.pointerColor || progressColor,
      },
    },
    axisTick: {
      show: false,
    },
    splitLine: {
      distance: -10,
      length: 8,
      lineStyle: {
        color: style.labelColor,
        width: 1,
      },
    },
    axisLabel: {
      distance: 14,
      color: style.labelColor,
      fontSize: 9,
    },
    title: {
      show: style.showTitle,
      offsetCenter: [0, '58%'],
      color: style.labelColor,
      fontSize: 10,
    },
    detail: {
      show: style.showValue,
      offsetCenter: [0, '34%'],
      color: style.labelColor,
      fontSize: 18,
      fontWeight: 600,
      formatter: value => formatGaugeValue(value, unit),
    },
    data: point
      ? [{ value: clamp(point.value, range.min, range.max), name: point.name || style.defaultName }]
      : [],
  }

  return {
    animation: false,
    backgroundColor: style.backgroundColor || 'transparent',
    tooltip: {
      show: false,
    },
    series: [series],
  }
}

function normalizeRange(minValue: number, maxValue: number): { min: number, max: number } {
  const min = Number.isFinite(minValue) ? minValue : 0
  const max = Number.isFinite(maxValue) ? maxValue : 100
  return max > min ? { min, max } : { min: 0, max: 100 }
}

function formatGaugeValue(value: number | string, unit: string): string {
  const numeric = typeof value === 'number' ? value : Number(value)
  const text = Number.isFinite(numeric) ? formatNumber(numeric) : String(value)
  return `${text}${unit}`
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}
