import type { PieSeriesOption } from 'echarts/charts'
import type { EChartsCoreOption } from 'echarts/core'
import type { ChartCategoryValuePoint, PieChartStyleOptions } from '../types'
import { clamp } from '../utils'

type PieSeriesOptionWithGap = PieSeriesOption & {
  padAngle?: number
  itemStyle?: NonNullable<PieSeriesOption['itemStyle']> & {
    borderRadius?: number
  }
}

export function createPieEChartsOption(data: ChartCategoryValuePoint[], style: PieChartStyleOptions): EChartsCoreOption {
  const series: PieSeriesOptionWithGap = {
    type: 'pie',
    radius: [`${clamp(style.innerRadiusPercent, 0, 80)}%`, '72%'],
    padAngle: clamp(style.sectorGapAngle, 0, 20),
    itemStyle: {
      borderRadius: clamp(style.sectorCornerRadius, 0, 20),
    },
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
    ...(style.backgroundColor ? { backgroundColor: style.backgroundColor } : {}),
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
