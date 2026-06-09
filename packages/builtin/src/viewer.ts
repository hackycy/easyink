import type { BuiltinViewerRegistrar } from './types'
import { BARCODE_TYPE, renderBarcode } from '@easyink/material-barcode'
import { CHART_BAR_TYPE, renderChartBar } from '@easyink/material-chart-bar'
import { CHART_CUSTOM_TYPE, renderChartCustom } from '@easyink/material-chart-custom'
import { CHART_GAUGE_TYPE, renderChartGauge } from '@easyink/material-chart-gauge'
import { CHART_LINE_TYPE, renderChartLine } from '@easyink/material-chart-line'
import { CHART_PIE_TYPE, renderChartPie } from '@easyink/material-chart-pie'
import { CHART_RADAR_TYPE, renderChartRadar } from '@easyink/material-chart-radar'
import { CHART_SCATTER_TYPE, renderChartScatter } from '@easyink/material-chart-scatter'
import { ELLIPSE_TYPE, renderEllipse } from '@easyink/material-ellipse'
import { FLOW_ROW_TYPE, measureFlowRow, renderFlowRow } from '@easyink/material-flow-row'
import { IMAGE_TYPE, renderImage } from '@easyink/material-image'
import { createLineViewerExtension, LINE_TYPE } from '@easyink/material-line'
import { PAGE_NUMBER_TYPE, renderPageNumber } from '@easyink/material-page-number'
import { PROGRESS_TYPE, renderProgress } from '@easyink/material-progress'
import { QRCODE_TYPE, renderQrcode } from '@easyink/material-qrcode'
import { RECT_TYPE, renderRect } from '@easyink/material-rect'
import { renderRingProgress, RING_PROGRESS_TYPE } from '@easyink/material-ring-progress'
import { renderSvgCustom, SVG_CUSTOM_TYPE } from '@easyink/material-svg-custom'
import { renderSvgHeart, SVG_HEART_TYPE } from '@easyink/material-svg-heart'
import { renderSvgStar, SVG_STAR_TYPE } from '@easyink/material-svg-star'
import { measureTableData, renderTableData, TABLE_DATA_TYPE, tableDataFragmentPaginator } from '@easyink/material-table-data'
import { renderTableStatic, TABLE_STATIC_TYPE } from '@easyink/material-table-static'
import { getTextRenderSize, measureText, renderText, TEXT_TYPE } from '@easyink/material-text'
import {
  barcodeMaterialBinding,
  chartBarMaterialBinding,
  chartCustomMaterialBinding,
  chartGaugeMaterialBinding,
  chartLineMaterialBinding,
  chartPieMaterialBinding,
  chartRadarMaterialBinding,
  chartScatterMaterialBinding,
  customMaterialBinding,
  imageMaterialBinding,
  noMaterialBinding,
  progressMaterialBinding,
  qrcodeMaterialBinding,
  ringProgressMaterialBinding,
  svgCustomMaterialBinding,
  textMaterialBinding,
} from './bindings'

export function registerBuiltinViewerMaterials(register: BuiltinViewerRegistrar): void {
  register(TEXT_TYPE, textMaterialBinding, {
    render: (node, ctx) => renderText(node, ctx),
    measure: (node, ctx) => measureText(node, ctx),
    getRenderSize: (node, ctx) => getTextRenderSize(node, ctx),
  })
  register(IMAGE_TYPE, imageMaterialBinding, { render: (node, ctx) => renderImage(node, ctx.unit) })
  register(BARCODE_TYPE, barcodeMaterialBinding, { render: node => renderBarcode(node) })
  register(QRCODE_TYPE, qrcodeMaterialBinding, { render: node => renderQrcode(node) })
  register(LINE_TYPE, noMaterialBinding, createLineViewerExtension())
  register(RECT_TYPE, noMaterialBinding, { render: (node, ctx) => renderRect(node, ctx.unit) })
  register(ELLIPSE_TYPE, noMaterialBinding, { render: (node, ctx) => renderEllipse(node, ctx.unit) })
  register(TABLE_STATIC_TYPE, customMaterialBinding, { render: (node, ctx) => renderTableStatic(node, ctx) })
  register(TABLE_DATA_TYPE, customMaterialBinding, {
    render: (node, ctx) => renderTableData(node, ctx),
    measure: (node, ctx) => measureTableData(node, ctx),
    fragmentPaginator: tableDataFragmentPaginator,
  })
  register(FLOW_ROW_TYPE, customMaterialBinding, {
    render: (node, ctx) => renderFlowRow(node, ctx),
    measure: (node, ctx) => measureFlowRow(node, ctx),
  })
  register(RING_PROGRESS_TYPE, ringProgressMaterialBinding, { render: (node, ctx) => renderRingProgress(node, ctx) })
  register(PROGRESS_TYPE, progressMaterialBinding, { render: (node, ctx) => renderProgress(node, ctx) })
  register(CHART_BAR_TYPE, chartBarMaterialBinding, { render: (node, ctx) => renderChartBar(node, ctx) })
  register(CHART_CUSTOM_TYPE, chartCustomMaterialBinding, { render: (node, ctx) => renderChartCustom(node, ctx) })
  register(CHART_GAUGE_TYPE, chartGaugeMaterialBinding, { render: (node, ctx) => renderChartGauge(node, ctx) })
  register(CHART_LINE_TYPE, chartLineMaterialBinding, { render: (node, ctx) => renderChartLine(node, ctx) })
  register(CHART_PIE_TYPE, chartPieMaterialBinding, { render: (node, ctx) => renderChartPie(node, ctx) })
  register(CHART_RADAR_TYPE, chartRadarMaterialBinding, { render: (node, ctx) => renderChartRadar(node, ctx) })
  register(CHART_SCATTER_TYPE, chartScatterMaterialBinding, { render: (node, ctx) => renderChartScatter(node, ctx) })
  register(SVG_CUSTOM_TYPE, svgCustomMaterialBinding, { render: node => renderSvgCustom(node) })
  register(SVG_STAR_TYPE, noMaterialBinding, { render: node => renderSvgStar(node) })
  register(SVG_HEART_TYPE, noMaterialBinding, { render: (node, ctx) => renderSvgHeart(node, ctx.unit) })
  register(PAGE_NUMBER_TYPE, noMaterialBinding, {
    render: (node, ctx) => renderPageNumber(node, ctx),
    pageAware: true,
  })
}
