import type { RadarSeriesOption } from 'echarts/charts'
import type { EChartsCoreOption } from 'echarts/core'
import type { ChartCategoryValuePoint, RadarChartStyleOptions } from '../types'

export function createRadarEChartsOption(data: ChartCategoryValuePoint[], style: RadarChartStyleOptions): EChartsCoreOption {
  const maxValue = resolveMaxValue(data, style.maxValue)
  const series: RadarSeriesOption = {
    type: 'radar',
    data: [
      {
        value: data.map(point => point.value),
        name: 'Value',
        lineStyle: {
          color: style.lineColor || '#2563eb',
          width: 2,
        },
        itemStyle: {
          color: style.pointColor || style.lineColor || '#2563eb',
        },
        ...(style.showArea
          ? {
              areaStyle: {
                color: style.areaColor || style.lineColor || '#93c5fd',
                opacity: 0.28,
              },
            }
          : {}),
      },
    ],
    symbol: style.showPoints ? 'circle' : 'none',
    symbolSize: 5,
    label: {
      show: style.showValueLabels,
      color: style.labelColor || '#1f2937',
      fontSize: 10,
    },
  }

  return {
    animation: false,
    backgroundColor: style.backgroundColor || 'transparent',
    tooltip: {
      show: false,
    },
    radar: {
      center: ['50%', '52%'],
      radius: '66%',
      indicator: data.map(point => ({
        name: point.label,
        max: maxValue,
      })),
      axisName: {
        show: style.showAxisLabels,
        color: style.labelColor || '#374151',
        fontSize: 10,
      },
      axisLine: {
        lineStyle: {
          color: style.axisColor || '#cbd5e1',
        },
      },
      splitLine: {
        lineStyle: {
          color: style.axisColor || '#cbd5e1',
        },
      },
      splitArea: {
        show: false,
      },
    },
    series: [series],
  }
}

function resolveMaxValue(data: ChartCategoryValuePoint[], maxValue: number): number {
  if (Number.isFinite(maxValue) && maxValue > 0)
    return maxValue
  const dataMax = Math.max(0, ...data.map(point => point.value))
  return dataMax > 0 ? dataMax : 100
}
