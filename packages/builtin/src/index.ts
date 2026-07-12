import type { CompiledMaterialProfile, MaterialPackageRegistration } from '@easyink/core'
import type { Component } from 'vue'
import { compileMaterialProfile, EASYINK_ENGINE_VERSION } from '@easyink/core'
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
import { barcodeMaterialManifest } from '@easyink/material-barcode'
import { chartBarMaterialManifest } from '@easyink/material-chart-bar'
import { chartCustomMaterialManifest } from '@easyink/material-chart-custom'
import { chartGaugeMaterialManifest } from '@easyink/material-chart-gauge'
import { chartLineMaterialManifest } from '@easyink/material-chart-line'
import { chartPieMaterialManifest } from '@easyink/material-chart-pie'
import { chartRadarMaterialManifest } from '@easyink/material-chart-radar'
import { chartScatterMaterialManifest } from '@easyink/material-chart-scatter'
import { ellipseMaterialManifest } from '@easyink/material-ellipse'
import { flowRowMaterialManifest } from '@easyink/material-flow-row'
import { imageMaterialManifest } from '@easyink/material-image'
import { lineMaterialManifest } from '@easyink/material-line'
import { pageNumberMaterialManifest } from '@easyink/material-page-number'
import { progressMaterialManifest } from '@easyink/material-progress'
import { qrcodeMaterialManifest } from '@easyink/material-qrcode'
import { ratingMaterialManifest } from '@easyink/material-rating'
import { rectMaterialManifest } from '@easyink/material-rect'
import { ringProgressMaterialManifest } from '@easyink/material-ring-progress'
import { signatureMaterialManifest } from '@easyink/material-signature'
import { svgCustomMaterialManifest } from '@easyink/material-svg-custom'
import { svgHeartMaterialManifest } from '@easyink/material-svg-heart'
import { svgStarMaterialManifest } from '@easyink/material-svg-star'
import { tableDataMaterialManifest } from '@easyink/material-table-data'
import { tableStaticMaterialManifest } from '@easyink/material-table-static'
import { textMaterialManifest } from '@easyink/material-text'

export type { BuiltinMaterialSet } from './types'

const basicManifests = Object.freeze([
  textMaterialManifest,
  imageMaterialManifest,
  barcodeMaterialManifest,
  qrcodeMaterialManifest,
  lineMaterialManifest,
  rectMaterialManifest,
  ellipseMaterialManifest,
  tableStaticMaterialManifest,
  tableDataMaterialManifest,
  flowRowMaterialManifest,
  ringProgressMaterialManifest,
  progressMaterialManifest,
  ratingMaterialManifest,
  svgCustomMaterialManifest,
  svgStarMaterialManifest,
  svgHeartMaterialManifest,
  pageNumberMaterialManifest,
])

export const builtinBasicMaterialPackage: MaterialPackageRegistration = Object.freeze({
  packageId: '@easyink/builtin-basic',
  kind: 'builtin',
  required: true,
  manifests: basicManifests,
})

export const builtinAllMaterialPackage: MaterialPackageRegistration = Object.freeze({
  packageId: '@easyink/builtin-all',
  kind: 'builtin',
  required: true,
  manifests: Object.freeze([
    ...basicManifests,
    signatureMaterialManifest,
    chartBarMaterialManifest,
    chartLineMaterialManifest,
    chartPieMaterialManifest,
    chartRadarMaterialManifest,
    chartScatterMaterialManifest,
    chartGaugeMaterialManifest,
    chartCustomMaterialManifest,
  ]),
})

export const builtinNoneMaterialPackage: MaterialPackageRegistration = Object.freeze({
  packageId: '@easyink/builtin-none',
  kind: 'builtin',
  required: true,
  manifests: Object.freeze([]),
})

export function getBuiltinMaterialPackage(set: 'basic' | 'all' | 'none'): MaterialPackageRegistration {
  return set === 'all' ? builtinAllMaterialPackage : set === 'basic' ? builtinBasicMaterialPackage : builtinNoneMaterialPackage
}

export function compileBuiltinMaterialProfile(set: 'basic' | 'all' | 'none', engineVersion = EASYINK_ENGINE_VERSION): CompiledMaterialProfile {
  return compileMaterialProfile({ id: `builtin:${set}`, engineVersion, packages: [getBuiltinMaterialPackage(set)] })
}

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

export const builtinCatalogGroupLabels = Object.freeze({
  basic: 'materials.catalog.basic',
  data: 'materials.catalog.data',
  chart: 'materials.catalog.chart',
  svg: 'materials.catalog.svg',
  utility: 'materials.catalog.utility',
})
