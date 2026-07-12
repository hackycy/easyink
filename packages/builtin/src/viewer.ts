import type { BuiltinMaterialSet, BuiltinViewerMaterialBundle, BuiltinViewerRegistrar } from './types'
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
import { RATING_TYPE, renderRating } from '@easyink/material-rating'
import { RECT_TYPE, renderRect } from '@easyink/material-rect'
import { renderRingProgress, RING_PROGRESS_TYPE } from '@easyink/material-ring-progress'
import { renderSignature, SIGNATURE_TYPE } from '@easyink/material-signature'
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
  ratingMaterialBinding,
  ringProgressMaterialBinding,
  svgCustomMaterialBinding,
  textMaterialBinding,
} from './bindings'

const ALL_BUILTIN_VIEWER_MATERIAL_BUNDLE: BuiltinViewerMaterialBundle = {
  materials: [
    {
      type: TEXT_TYPE,
      binding: textMaterialBinding,
      extension: {
        render: (node, ctx) => renderText(node, ctx),
        measure: (node, ctx) => measureText(node, ctx),
        getRenderSize: (node, ctx) => getTextRenderSize(node, ctx),
      },
    },
    { type: IMAGE_TYPE, binding: imageMaterialBinding, extension: { render: (node, ctx) => renderImage(node, ctx.unit) } },
    { type: BARCODE_TYPE, binding: barcodeMaterialBinding, extension: { render: node => renderBarcode(node) } },
    { type: QRCODE_TYPE, binding: qrcodeMaterialBinding, extension: { render: node => renderQrcode(node) } },
    { type: LINE_TYPE, binding: noMaterialBinding, extension: createLineViewerExtension() },
    { type: RECT_TYPE, binding: noMaterialBinding, extension: { render: (node, ctx) => renderRect(node, ctx.unit) } },
    { type: SIGNATURE_TYPE, binding: noMaterialBinding, extension: { render: node => renderSignature(node) } },
    { type: ELLIPSE_TYPE, binding: noMaterialBinding, extension: { render: (node, ctx) => renderEllipse(node, ctx.unit) } },
    { type: TABLE_STATIC_TYPE, binding: customMaterialBinding, extension: { render: (node, ctx) => renderTableStatic(node, ctx) } },
    {
      type: TABLE_DATA_TYPE,
      binding: customMaterialBinding,
      extension: {
        render: (node, ctx) => renderTableData(node, ctx),
        measure: (node, ctx) => measureTableData(node, ctx),
        fragmentPaginator: tableDataFragmentPaginator,
      },
    },
    {
      type: FLOW_ROW_TYPE,
      binding: customMaterialBinding,
      extension: {
        render: (node, ctx) => renderFlowRow(node, ctx),
        measure: (node, ctx) => measureFlowRow(node, ctx),
      },
    },
    { type: RING_PROGRESS_TYPE, binding: ringProgressMaterialBinding, extension: { render: (node, ctx) => renderRingProgress(node, ctx) } },
    { type: PROGRESS_TYPE, binding: progressMaterialBinding, extension: { render: (node, ctx) => renderProgress(node, ctx) } },
    { type: RATING_TYPE, binding: ratingMaterialBinding, extension: { render: (node, ctx) => renderRating(node, ctx) } },
    { type: CHART_BAR_TYPE, binding: chartBarMaterialBinding, extension: { render: (node, ctx) => renderChartBar(node, ctx) } },
    { type: CHART_CUSTOM_TYPE, binding: chartCustomMaterialBinding, extension: { render: (node, ctx) => renderChartCustom(node, ctx) } },
    { type: CHART_GAUGE_TYPE, binding: chartGaugeMaterialBinding, extension: { render: (node, ctx) => renderChartGauge(node, ctx) } },
    { type: CHART_LINE_TYPE, binding: chartLineMaterialBinding, extension: { render: (node, ctx) => renderChartLine(node, ctx) } },
    { type: CHART_PIE_TYPE, binding: chartPieMaterialBinding, extension: { render: (node, ctx) => renderChartPie(node, ctx) } },
    { type: CHART_RADAR_TYPE, binding: chartRadarMaterialBinding, extension: { render: (node, ctx) => renderChartRadar(node, ctx) } },
    { type: CHART_SCATTER_TYPE, binding: chartScatterMaterialBinding, extension: { render: (node, ctx) => renderChartScatter(node, ctx) } },
    { type: SVG_CUSTOM_TYPE, binding: svgCustomMaterialBinding, extension: { render: node => renderSvgCustom(node) } },
    { type: SVG_STAR_TYPE, binding: noMaterialBinding, extension: { render: node => renderSvgStar(node) } },
    { type: SVG_HEART_TYPE, binding: noMaterialBinding, extension: { render: (node, ctx) => renderSvgHeart(node, ctx.unit) } },
    {
      type: PAGE_NUMBER_TYPE,
      binding: noMaterialBinding,
      extension: {
        render: (node, ctx) => renderPageNumber(node, ctx),
        pageAware: true,
      },
    },
  ],
}

export function createBuiltinViewerMaterialBundle(set: BuiltinMaterialSet = 'all'): BuiltinViewerMaterialBundle {
  if (set === 'none') {
    return {
      materials: [],
    }
  }

  if (set === 'basic') {
    return {
      materials: ALL_BUILTIN_VIEWER_MATERIAL_BUNDLE.materials.filter(material =>
        !isChartMaterialType(material.type) && material.type !== SIGNATURE_TYPE,
      ),
    }
  }

  return cloneBuiltinViewerMaterialBundle(ALL_BUILTIN_VIEWER_MATERIAL_BUNDLE)
}

export const builtinViewerMaterialSets = {
  all: createBuiltinViewerMaterialBundle('all'),
  basic: createBuiltinViewerMaterialBundle('basic'),
  none: createBuiltinViewerMaterialBundle('none'),
} satisfies Record<BuiltinMaterialSet, BuiltinViewerMaterialBundle>

export function registerBuiltinViewerMaterialBundle(register: BuiltinViewerRegistrar, bundle: BuiltinViewerMaterialBundle): void {
  const materialBindingKey = 'binding'
  for (const material of bundle.materials)
    register(material.type, material[materialBindingKey], material.extension)
}

export function registerBuiltinViewerMaterials(register: BuiltinViewerRegistrar, set: BuiltinMaterialSet = 'all'): void {
  registerBuiltinViewerMaterialBundle(register, createBuiltinViewerMaterialBundle(set))
}

function cloneBuiltinViewerMaterialBundle(bundle: BuiltinViewerMaterialBundle): BuiltinViewerMaterialBundle {
  return {
    materials: [...bundle.materials],
  }
}

function isChartMaterialType(type: string): boolean {
  return type === CHART_BAR_TYPE
    || type === CHART_CUSTOM_TYPE
    || type === CHART_GAUGE_TYPE
    || type === CHART_LINE_TYPE
    || type === CHART_PIE_TYPE
    || type === CHART_RADAR_TYPE
    || type === CHART_SCATTER_TYPE
}
