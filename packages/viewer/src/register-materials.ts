import type { ViewerRuntime } from './runtime'

import { BARCODE_TYPE, renderBarcode } from '@easyink/material-barcode'
import { CHART_TYPE, renderChart } from '@easyink/material-chart'
import { CONTAINER_TYPE, renderContainer } from '@easyink/material-container'
import { ELLIPSE_TYPE, renderEllipse } from '@easyink/material-ellipse'
import { IMAGE_TYPE, renderImage } from '@easyink/material-image'
import { LINE_TYPE, renderLine } from '@easyink/material-line'
import { QRCODE_TYPE, renderQrcode } from '@easyink/material-qrcode'
import { RECT_TYPE, renderRect } from '@easyink/material-rect'
import { RELATION_TYPE, renderRelation } from '@easyink/material-relation'
import { renderSvg, SVG_TYPE } from '@easyink/material-svg'
import { renderTableData, TABLE_DATA_TYPE } from '@easyink/material-table-data'
import { renderTableStatic, TABLE_STATIC_TYPE } from '@easyink/material-table-static'
import { renderText, TEXT_TYPE } from '@easyink/material-text'

/**
 * Register all built-in material viewer extensions on a ViewerRuntime instance.
 * Each material's render function is adapted to the MaterialViewerExtension interface.
 */
export function registerBuiltinViewerMaterials(viewer: ViewerRuntime): void {
  viewer.registerMaterial(TEXT_TYPE, { render: (node, ctx) => renderText(node, ctx.data) })
  viewer.registerMaterial(IMAGE_TYPE, { render: node => renderImage(node) })
  viewer.registerMaterial(BARCODE_TYPE, { render: node => renderBarcode(node) })
  viewer.registerMaterial(QRCODE_TYPE, { render: node => renderQrcode(node) })
  viewer.registerMaterial(LINE_TYPE, { render: node => renderLine(node) })
  viewer.registerMaterial(RECT_TYPE, { render: node => renderRect(node) })
  viewer.registerMaterial(ELLIPSE_TYPE, { render: node => renderEllipse(node) })
  viewer.registerMaterial(CONTAINER_TYPE, { render: node => renderContainer(node) })
  viewer.registerMaterial(TABLE_STATIC_TYPE, { render: node => renderTableStatic(node) })
  viewer.registerMaterial(TABLE_DATA_TYPE, { render: (node, ctx) => renderTableData(node, ctx) })
  viewer.registerMaterial(CHART_TYPE, { render: node => renderChart(node) })
  viewer.registerMaterial(SVG_TYPE, { render: node => renderSvg(node) })
  viewer.registerMaterial(RELATION_TYPE, { render: node => renderRelation(node) })
}
