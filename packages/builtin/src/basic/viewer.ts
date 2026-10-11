import type { ViewerMaterial } from '@easyink/plugin-api/viewer'
import { barcode } from '@easyink/material-barcode/viewer'
import { ellipse } from '@easyink/material-ellipse/viewer'
import { flowRow } from '@easyink/material-flow-row/viewer'
import { image } from '@easyink/material-image/viewer'
import { line } from '@easyink/material-line/viewer'
import { pageNumber } from '@easyink/material-page-number/viewer'
import { progress } from '@easyink/material-progress/viewer'
import { qrcode } from '@easyink/material-qrcode/viewer'
import { rating } from '@easyink/material-rating/viewer'
import { rect } from '@easyink/material-rect/viewer'
import { ringProgress } from '@easyink/material-ring-progress/viewer'
import { svgCustom } from '@easyink/material-svg-custom/viewer'
import { svgHeart } from '@easyink/material-svg-heart/viewer'
import { svgStar } from '@easyink/material-svg-star/viewer'
import { tableData } from '@easyink/material-table-data/viewer'
import { tableStatic } from '@easyink/material-table-static/viewer'
import { text } from '@easyink/material-text/viewer'

export const materials: readonly ViewerMaterial[] = [
  text,
  image,
  barcode,
  qrcode,
  line,
  rect,
  ellipse,
  tableStatic,
  tableData,
  flowRow,
  ringProgress,
  progress,
  rating,
  svgCustom,
  svgStar,
  svgHeart,
  pageNumber,
]
