import type { DesignerMaterial } from '@easyink/plugin-api/ui'
import { barcode } from '@easyink/material-barcode'
import { chartBar } from '@easyink/material-chart-bar'
import { chartCustom } from '@easyink/material-chart-custom'
import { chartGauge } from '@easyink/material-chart-gauge'
import { chartLine } from '@easyink/material-chart-line'
import { chartPie } from '@easyink/material-chart-pie'
import { chartRadar } from '@easyink/material-chart-radar'
import { chartScatter } from '@easyink/material-chart-scatter'
import { ellipse } from '@easyink/material-ellipse'
import { flowRow } from '@easyink/material-flow-row'
import { image } from '@easyink/material-image'
import { line } from '@easyink/material-line'
import { pageNumber } from '@easyink/material-page-number'
import { progress } from '@easyink/material-progress'
import { qrcode } from '@easyink/material-qrcode'
import { rating } from '@easyink/material-rating'
import { rect } from '@easyink/material-rect'
import { ringProgress } from '@easyink/material-ring-progress'
import { signature } from '@easyink/material-signature'
import { svgCustom } from '@easyink/material-svg-custom'
import { svgHeart } from '@easyink/material-svg-heart'
import { svgStar } from '@easyink/material-svg-star'
import { tableData } from '@easyink/material-table-data'
import { tableStatic } from '@easyink/material-table-static'
import { text } from '@easyink/material-text'

export const materials: readonly DesignerMaterial[] = Object.freeze([
  text,
  image,
  barcode,
  qrcode,
  line,
  rect,
  signature,
  ellipse,
  tableStatic,
  tableData,
  flowRow,
  ringProgress,
  progress,
  rating,
  chartBar,
  chartLine,
  chartPie,
  chartRadar,
  chartScatter,
  chartGauge,
  chartCustom,
  svgCustom,
  svgStar,
  svgHeart,
  pageNumber,
])
