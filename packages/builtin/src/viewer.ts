import type { BuiltinViewerRegistrar } from './types'
import { BARCODE_TYPE, renderBarcode } from '@easyink/material-barcode'
import { CHART_TYPE, renderChart } from '@easyink/material-chart'
import { CONTAINER_TYPE, renderContainer } from '@easyink/material-container'
import { ELLIPSE_TYPE, renderEllipse } from '@easyink/material-ellipse'
import { IMAGE_TYPE, renderImage } from '@easyink/material-image'
import { LINE_TYPE, renderLine } from '@easyink/material-line'
import { PAGE_NUMBER_TYPE, renderPageNumber } from '@easyink/material-page-number'
import { QRCODE_TYPE, renderQrcode } from '@easyink/material-qrcode'
import { RECT_TYPE, renderRect } from '@easyink/material-rect'
import { renderSvg, SVG_TYPE } from '@easyink/material-svg'
import { measureTableData, renderTableData, TABLE_DATA_TYPE } from '@easyink/material-table-data'
import { renderTableStatic, TABLE_STATIC_TYPE } from '@easyink/material-table-static'
import { renderText, TEXT_TYPE } from '@easyink/material-text'

export function registerBuiltinViewerMaterials(register: BuiltinViewerRegistrar): void {
  register(TEXT_TYPE, { render: (node, ctx) => renderText(node, ctx.data, ctx.unit) })
  register(IMAGE_TYPE, { render: (node, ctx) => renderImage(node, ctx.unit) })
  register(BARCODE_TYPE, { render: node => renderBarcode(node) })
  register(QRCODE_TYPE, { render: node => renderQrcode(node) })
  register(LINE_TYPE, { render: (node, ctx) => renderLine(node, ctx) })
  register(RECT_TYPE, { render: (node, ctx) => renderRect(node, ctx.unit) })
  register(ELLIPSE_TYPE, { render: (node, ctx) => renderEllipse(node, ctx.unit) })
  register(CONTAINER_TYPE, { render: (node, ctx) => renderContainer(node, ctx.unit) })
  register(TABLE_STATIC_TYPE, { render: (node, ctx) => renderTableStatic(node, ctx.unit) })
  register(TABLE_DATA_TYPE, {
    render: (node, ctx) => renderTableData(node, ctx),
    measure: (node, ctx) => measureTableData(node, ctx),
  })
  register(CHART_TYPE, { render: node => renderChart(node) })
  register(SVG_TYPE, { render: node => renderSvg(node) })
  register(PAGE_NUMBER_TYPE, {
    render: (node, ctx) => renderPageNumber(node, ctx),
    pageAware: true,
  })
}
