import type { ScatterSeriesOption } from 'echarts/charts'
import type { EChartsCoreOption } from 'echarts/core'
import type { ChartScatterPoint, ScatterChartStyleOptions } from '../types'
import { clamp } from '../utils'

export function createScatterEChartsOption(data: ChartScatterPoint[], style: ScatterChartStyleOptions): EChartsCoreOption {
  const series: ScatterSeriesOption = {
    type: 'scatter',
    data: data.map(point => createScatterDataItem(point)),
    symbolSize: clamp(style.symbolSize, 2, 24),
    itemStyle: {
      color: style.pointColor || '#2563eb',
    },
    label: {
      show: style.showValueLabels,
      position: 'top',
      color: style.labelColor || '#1f2937',
      fontSize: 10,
      formatter(params) {
        const name = typeof params.name === 'string' ? params.name : ''
        return name || String(params.value)
      },
    },
  }

  return {
    animation: false,
    ...(style.backgroundColor ? { backgroundColor: style.backgroundColor } : {}),
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
      type: 'value',
      splitLine: {
        show: style.showGrid,
        lineStyle: { color: '#e5e7eb' },
      },
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

function createScatterDataItem(point: ChartScatterPoint): NonNullable<ScatterSeriesOption['data']>[number] {
  const item: NonNullable<ScatterSeriesOption['data']>[number] = {
    name: point.label,
    value: [point.x, point.y],
  }
  if (point.color) {
    item.itemStyle = {
      color: point.color,
    }
  }
  return item
}
