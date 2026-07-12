import type { Component } from 'vue'
import {
  IconBarcode,
  IconChartBar,
  IconChartCustom,
  IconChartGauge,
  IconChartLine,
  IconChartPie,
  IconChartRadar,
  IconChartScatter,
  IconDataTable,
  IconEllipse,
  IconHeart,
  IconImage,
  IconLayoutPanelTop,
  IconLine,
  IconPageNumber,
  IconProgress,
  IconQrcode,
  IconRating,
  IconRect,
  IconRingProgress,
  IconSignature,
  IconStar,
  IconSvg,
  IconTable,
  IconText,
} from '@easyink/icons'

export const builtinMaterialIcons: Readonly<Record<string, Component>> = Object.freeze({
  'text': IconText,
  'image': IconImage,
  'barcode': IconBarcode,
  'qrcode': IconQrcode,
  'line': IconLine,
  'rect': IconRect,
  'ellipse': IconEllipse,
  'table': IconTable,
  'table-data': IconDataTable,
  'flow-row': IconLayoutPanelTop,
  'ring-progress': IconRingProgress,
  'progress': IconProgress,
  'rating': IconRating,
  'svg-custom': IconSvg,
  'svg-star': IconStar,
  'svg-heart': IconHeart,
  'page-number': IconPageNumber,
  'signature': IconSignature,
  'chart-bar': IconChartBar,
  'chart-line': IconChartLine,
  'chart-pie': IconChartPie,
  'chart-radar': IconChartRadar,
  'chart-scatter': IconChartScatter,
  'chart-gauge': IconChartGauge,
  'chart-custom': IconChartCustom,
})

export const builtinMaterialGroupLabels = Object.freeze({
  basic: 'materials.catalog.basic',
  data: 'materials.catalog.data',
  chart: 'materials.catalog.chart',
  svg: 'materials.catalog.svg',
  utility: 'materials.catalog.utility',
})

export function resolveBuiltinMaterialIcon(iconKey: string): Component {
  return builtinMaterialIcons[iconKey] ?? IconRect
}
