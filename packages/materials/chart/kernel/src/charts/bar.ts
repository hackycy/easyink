import type { BarSeriesOption } from 'echarts/charts'
import type { EChartsCoreOption } from 'echarts/core'
import type { BarChartStyleOptions, ChartCategoryValuePoint } from '../types'
import { createCartesianChartScaffold } from './cartesian'

export function createBarEChartsOption(data: ChartCategoryValuePoint[], style: BarChartStyleOptions): EChartsCoreOption {
  const { option, values } = createCartesianChartScaffold(data, style)
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
    ...option,
    series: [series],
  }
}
