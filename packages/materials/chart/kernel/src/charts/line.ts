import type { LineSeriesOption } from 'echarts/charts'
import type { EChartsCoreOption } from 'echarts/core'
import type { ChartCategoryValuePoint, LineChartStyleOptions } from '../types'
import { createCartesianChartScaffold } from './cartesian'

export function createLineEChartsOption(data: ChartCategoryValuePoint[], style: LineChartStyleOptions): EChartsCoreOption {
  const { option, values } = createCartesianChartScaffold(data, style)
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
    ...option,
    series: [series],
  }
}
