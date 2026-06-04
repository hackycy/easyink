import type { BuiltinViewerRegistrar } from './types'
import { BARCODE_TYPE, renderBarcode } from '@easyink/material-barcode'
import { CHART_BAR_TYPE, renderChartBar } from '@easyink/material-chart-bar'
import { ELLIPSE_TYPE, renderEllipse } from '@easyink/material-ellipse'
import { FLOW_ROW_TYPE, measureFlowRow, renderFlowRow } from '@easyink/material-flow-row'
import { IMAGE_TYPE, renderImage } from '@easyink/material-image'
import { createLineViewerExtension, LINE_TYPE } from '@easyink/material-line'
import { PAGE_NUMBER_TYPE, renderPageNumber } from '@easyink/material-page-number'
import { QRCODE_TYPE, renderQrcode } from '@easyink/material-qrcode'
import { RECT_TYPE, renderRect } from '@easyink/material-rect'
import { renderSvgCustom, SVG_CUSTOM_TYPE } from '@easyink/material-svg-custom'
import { renderSvgHeart, SVG_HEART_TYPE } from '@easyink/material-svg-heart'
import { renderSvgStar, SVG_STAR_TYPE } from '@easyink/material-svg-star'
import { measureTableData, renderTableData, TABLE_DATA_TYPE, tableDataFragmentPaginator } from '@easyink/material-table-data'
import { renderTableStatic, TABLE_STATIC_TYPE } from '@easyink/material-table-static'
import { getTextRenderSize, measureText, renderText, TEXT_TYPE } from '@easyink/material-text'

export function registerBuiltinViewerMaterials(register: BuiltinViewerRegistrar): void {
  register(TEXT_TYPE, {
    render: (node, ctx) => renderText(node, ctx),
    measure: (node, ctx) => measureText(node, ctx),
    getRenderSize: (node, ctx) => getTextRenderSize(node, ctx),
  })
  register(IMAGE_TYPE, { render: (node, ctx) => renderImage(node, ctx.unit) })
  register(BARCODE_TYPE, { render: node => renderBarcode(node) })
  register(QRCODE_TYPE, { render: node => renderQrcode(node) })
  register(LINE_TYPE, createLineViewerExtension())
  register(RECT_TYPE, { render: (node, ctx) => renderRect(node, ctx.unit) })
  register(ELLIPSE_TYPE, { render: (node, ctx) => renderEllipse(node, ctx.unit) })
  register(TABLE_STATIC_TYPE, { render: (node, ctx) => renderTableStatic(node, ctx) })
  register(TABLE_DATA_TYPE, {
    render: (node, ctx) => renderTableData(node, ctx),
    measure: (node, ctx) => measureTableData(node, ctx),
    fragmentPaginator: tableDataFragmentPaginator,
  })
  register(FLOW_ROW_TYPE, {
    render: (node, ctx) => renderFlowRow(node, ctx),
    measure: (node, ctx) => measureFlowRow(node, ctx),
  })
  register(CHART_BAR_TYPE, { render: (node, ctx) => renderChartBar(node, ctx) })
  register(SVG_CUSTOM_TYPE, { render: node => renderSvgCustom(node) })
  register(SVG_STAR_TYPE, { render: node => renderSvgStar(node) })
  register(SVG_HEART_TYPE, { render: (node, ctx) => renderSvgHeart(node, ctx.unit) })
  register(PAGE_NUMBER_TYPE, {
    render: (node, ctx) => renderPageNumber(node, ctx),
    pageAware: true,
  })
}
