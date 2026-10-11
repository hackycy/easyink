import type { DesignerMaterial } from '@easyink/plugin-api/ui'
import { barcode } from '@easyink/material-barcode'
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
])
