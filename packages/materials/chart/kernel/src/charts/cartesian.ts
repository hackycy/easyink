import type { EChartsCoreOption } from 'echarts/core'
import type { ChartCategoryValuePoint } from '../types'

export interface CartesianChartStyleOptions {
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

export interface CartesianChartScaffold {
  categories: string[]
  values: number[]
  option: EChartsCoreOption
}

export function createCartesianChartScaffold(data: ChartCategoryValuePoint[], style: CartesianChartStyleOptions): CartesianChartScaffold {
  const categories = data.map(point => point.label)
  const values = data.map(point => point.value)

  return {
    categories,
    values,
    option: {
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
    },
  }
}
