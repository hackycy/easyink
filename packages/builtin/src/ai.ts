import type { AIMaterialDescriptor } from '@easyink/shared'
import { barcodeAIMaterialDescriptor } from '@easyink/material-barcode'
import { chartAIMaterialDescriptor } from '@easyink/material-chart'
import { containerAIMaterialDescriptor } from '@easyink/material-container'
import { ellipseAIMaterialDescriptor } from '@easyink/material-ellipse'
import { flowRowAIMaterialDescriptor } from '@easyink/material-flow-row'
import { imageAIMaterialDescriptor } from '@easyink/material-image'
import { lineAIMaterialDescriptor } from '@easyink/material-line'
import { pageNumberAIMaterialDescriptor } from '@easyink/material-page-number'
import { qrcodeAIMaterialDescriptor } from '@easyink/material-qrcode'
import { rectAIMaterialDescriptor } from '@easyink/material-rect'
import { svgCustomAIMaterialDescriptor } from '@easyink/material-svg-custom'
import { svgHeartAIMaterialDescriptor } from '@easyink/material-svg-heart'
import { svgStarAIMaterialDescriptor } from '@easyink/material-svg-star'
import { tableDataAIMaterialDescriptor } from '@easyink/material-table-data'
import { tableStaticAIMaterialDescriptor } from '@easyink/material-table-static'
import { textAIMaterialDescriptor } from '@easyink/material-text'

export const builtinAIMaterialDescriptors: AIMaterialDescriptor[] = [
  textAIMaterialDescriptor,
  lineAIMaterialDescriptor,
  tableDataAIMaterialDescriptor,
  flowRowAIMaterialDescriptor,
  tableStaticAIMaterialDescriptor,
  imageAIMaterialDescriptor,
  qrcodeAIMaterialDescriptor,
  barcodeAIMaterialDescriptor,
  rectAIMaterialDescriptor,
  ellipseAIMaterialDescriptor,
  containerAIMaterialDescriptor,
  pageNumberAIMaterialDescriptor,
  svgCustomAIMaterialDescriptor,
  svgStarAIMaterialDescriptor,
  svgHeartAIMaterialDescriptor,
  chartAIMaterialDescriptor,
]
