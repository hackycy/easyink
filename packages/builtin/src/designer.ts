import type { BuiltinDesignerMaterialBundle, BuiltinLocaleMessages, BuiltinMaterialSet, BuiltinPanelSectionId } from './types'
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
import {
  BARCODE_TYPE,
  barcodeAIMaterialDescriptor,
  barcodeDesignerPropSchemas,
  barcodeLocaleMessages,
  createBarcodeExtension,
} from '@easyink/material-barcode'
import { barcodeModel } from '@easyink/material-barcode/material-model'
import {
  CHART_BAR_TYPE,
  chartBarAIMaterialDescriptor,
  chartBarDesignerPropSchemas,
  chartBarLocaleMessages,
  createChartBarExtension,
} from '@easyink/material-chart-bar'
import { chartBarModel } from '@easyink/material-chart-bar/material-model'
import { chartCustomAIMaterialDescriptor } from '@easyink/material-chart-custom/ai'
import { chartCustomLocaleMessages } from '@easyink/material-chart-custom/locale'
import { chartCustomModel } from '@easyink/material-chart-custom/material-model'
import { chartCustomDesignerPropSchemas } from '@easyink/material-chart-custom/prop-schemas'
import {
  CHART_CUSTOM_TYPE,
} from '@easyink/material-chart-custom/schema'
import {
  CHART_GAUGE_TYPE,
  chartGaugeAIMaterialDescriptor,
  chartGaugeDesignerPropSchemas,
  chartGaugeLocaleMessages,
  createChartGaugeExtension,
} from '@easyink/material-chart-gauge'
import { chartGaugeModel } from '@easyink/material-chart-gauge/material-model'
import {
  CHART_LINE_TYPE,
  chartLineAIMaterialDescriptor,
  chartLineDesignerPropSchemas,
  chartLineLocaleMessages,
  createChartLineExtension,
} from '@easyink/material-chart-line'
import { chartLineModel } from '@easyink/material-chart-line/material-model'
import {
  CHART_PIE_TYPE,
  chartPieAIMaterialDescriptor,
  chartPieDesignerPropSchemas,
  chartPieLocaleMessages,
  createChartPieExtension,
} from '@easyink/material-chart-pie'
import { chartPieModel } from '@easyink/material-chart-pie/material-model'
import {
  CHART_RADAR_TYPE,
  chartRadarAIMaterialDescriptor,
  chartRadarDesignerPropSchemas,
  chartRadarLocaleMessages,
  createChartRadarExtension,
} from '@easyink/material-chart-radar'
import { chartRadarModel } from '@easyink/material-chart-radar/material-model'
import {
  CHART_SCATTER_TYPE,
  chartScatterAIMaterialDescriptor,
  chartScatterDesignerPropSchemas,
  chartScatterLocaleMessages,
  createChartScatterExtension,
} from '@easyink/material-chart-scatter'
import { chartScatterModel } from '@easyink/material-chart-scatter/material-model'
import {
  createEllipseExtension,
  ELLIPSE_TYPE,
  ellipseAIMaterialDescriptor,
  ellipseDesignerPropSchemas,
  ellipseLocaleMessages,
} from '@easyink/material-ellipse'
import { ellipseModel } from '@easyink/material-ellipse/material-model'
import {
  createFlowRowExtension,
  FLOW_ROW_TYPE,
  flowRowAIMaterialDescriptor,
  flowRowDesignerPropSchemas,
  flowRowLocaleMessages,
} from '@easyink/material-flow-row'
import { flowRowModel } from '@easyink/material-flow-row/material-model'
import {
  createImageExtension,
  IMAGE_TYPE,
  imageAIMaterialDescriptor,
  imageDesignerPropSchemas,
  imageLocaleMessages,
} from '@easyink/material-image'
import { imageModel } from '@easyink/material-image/material-model'
import {
  createLineExtension,
  LINE_TYPE,
  lineAIMaterialDescriptor,
  lineDesignerPropSchemas,
  lineLocaleMessages,
} from '@easyink/material-line'
import { lineModel } from '@easyink/material-line/material-model'
import {
  createPageNumberExtension,
  PAGE_NUMBER_TYPE,
  pageNumberAIMaterialDescriptor,
  pageNumberDesignerPropSchemas,
  pageNumberLocaleMessages,
} from '@easyink/material-page-number'
import { pageNumberModel } from '@easyink/material-page-number/material-model'
import {
  createProgressExtension,
  PROGRESS_TYPE,
  progressAIMaterialDescriptor,
  progressDesignerPropSchemas,
  progressLocaleMessages,
} from '@easyink/material-progress'
import { progressModel } from '@easyink/material-progress/material-model'
import {
  createQrcodeExtension,
  QRCODE_TYPE,
  qrcodeAIMaterialDescriptor,
  qrcodeDesignerPropSchemas,
  qrcodeLocaleMessages,
} from '@easyink/material-qrcode'
import { qrcodeModel } from '@easyink/material-qrcode/material-model'
import {
  createRatingExtension,
  RATING_TYPE,
  ratingAIMaterialDescriptor,
  ratingDesignerPropSchemas,
  ratingLocaleMessages,
} from '@easyink/material-rating'
import { ratingModel } from '@easyink/material-rating/material-model'
import {
  createRectExtension,
  RECT_TYPE,
  rectAIMaterialDescriptor,
  rectDesignerPropSchemas,
  rectLocaleMessages,
} from '@easyink/material-rect'
import { rectModel } from '@easyink/material-rect/material-model'
import {
  createRingProgressExtension,
  RING_PROGRESS_TYPE,
  ringProgressAIMaterialDescriptor,
  ringProgressDesignerPropSchemas,
  ringProgressLocaleMessages,
} from '@easyink/material-ring-progress'
import { ringProgressModel } from '@easyink/material-ring-progress/material-model'
import {
  createSignatureExtension,
  SIGNATURE_TYPE,
  signatureAIMaterialDescriptor,
  signatureDesignerPropSchemas,
  signatureLocaleMessages,
} from '@easyink/material-signature'
import { signatureModel } from '@easyink/material-signature/material-model'
import {
  createSvgCustomExtension,
  SVG_CUSTOM_TYPE,
  svgCustomAIMaterialDescriptor,
  svgCustomDesignerPropSchemas,
  svgCustomLocaleMessages,
} from '@easyink/material-svg-custom'
import { svgCustomModel } from '@easyink/material-svg-custom/material-model'
import {
  createSvgHeartExtension,
  SVG_HEART_TYPE,
  svgHeartAIMaterialDescriptor,
  svgHeartDesignerPropSchemas,
  svgHeartLocaleMessages,
} from '@easyink/material-svg-heart'
import { svgHeartModel } from '@easyink/material-svg-heart/material-model'
import {
  createSvgStarExtension,
  SVG_STAR_TYPE,
  svgStarAIMaterialDescriptor,
  svgStarDesignerPropSchemas,
  svgStarLocaleMessages,
} from '@easyink/material-svg-star'
import { svgStarModel } from '@easyink/material-svg-star/material-model'
import {
  createTableDataExtension,
  TABLE_DATA_TYPE,
  tableDataAIMaterialDescriptor,
  tableDataDesignerPropSchemas,
  tableDataLocaleMessages,
} from '@easyink/material-table-data'
import { tableDataModel } from '@easyink/material-table-data/material-model'
import { tableKernelLocaleMessages } from '@easyink/material-table-kernel'
import {
  createTableStaticExtension,
  TABLE_STATIC_TYPE,
  tableStaticAIMaterialDescriptor,
  tableStaticDesignerPropSchemas,
  tableStaticLocaleMessages,
} from '@easyink/material-table-static'
import { tableStaticModel } from '@easyink/material-table-static/material-model'
import {
  createTextExtension,
  TEXT_TYPE,
  textAIMaterialDescriptor,
  textDesignerPropSchemas,
  textLocaleMessages,
} from '@easyink/material-text'
import { textModel } from '@easyink/material-text/material-model'

function tableSectionFilter(sectionId: BuiltinPanelSectionId): boolean {
  return sectionId !== 'binding'
}

const builtinCatalogLocaleMessages = {
  messages: {
    materials: {
      catalog: {
        basic: '基础',
        data: '数据',
        chart: '图表',
        svg: 'SVG',
        utility: '工具',
      },
    },
  },
  locales: {
    'zh-CN': {
      materials: {
        catalog: {
          basic: '基础',
          data: '数据',
          chart: '图表',
          svg: 'SVG',
          utility: '工具',
        },
      },
    },
    'en-US': {
      materials: {
        catalog: {
          basic: 'Basic',
          data: 'Data',
          chart: 'Chart',
          svg: 'SVG',
          utility: 'Utility',
        },
      },
    },
  },
}

function mergeLocaleMessages(
  base: NonNullable<BuiltinDesignerMaterialBundle['localeMessages']>,
  extension: NonNullable<BuiltinDesignerMaterialBundle['localeMessages']>,
): NonNullable<BuiltinDesignerMaterialBundle['localeMessages']> {
  return {
    messages: mergeLocaleObject(base.messages, extension.messages),
    locales: {
      ...base.locales,
      ...Object.fromEntries(Object.entries(extension.locales ?? {}).map(([code, messages]) => [
        code,
        mergeLocaleObject(base.locales?.[code], messages),
      ])),
    },
  }
}

function mergeLocaleObject(base?: BuiltinLocaleMessages, extension?: BuiltinLocaleMessages): BuiltinLocaleMessages {
  const merged: BuiltinLocaleMessages = { ...(base ?? {}) }
  for (const [key, value] of Object.entries(extension ?? {})) {
    const current = merged[key]
    merged[key] = isLocaleObject(current) && isLocaleObject(value)
      ? mergeLocaleObject(current, value)
      : value
  }
  return merged
}

function isLocaleObject(value: unknown): value is BuiltinLocaleMessages {
  return typeof value === 'object' && value !== null
}

const ALL_BUILTIN_DESIGNER_MATERIAL_BUNDLE: BuiltinDesignerMaterialBundle = {
  localeMessages: mergeLocaleMessages(tableKernelLocaleMessages, builtinCatalogLocaleMessages),
  materials: [
    {
      ...textModel,
      name: 'materials.text.name',
      icon: IconText,
      category: 'basic',
      aiDescriptor: textAIMaterialDescriptor,
      factory: createTextExtension,
      propSchemas: textDesignerPropSchemas,
      localeMessages: textLocaleMessages,
    },
    {
      ...imageModel,
      name: 'materials.image.name',
      icon: IconImage,
      category: 'basic',
      aiDescriptor: imageAIMaterialDescriptor,
      factory: createImageExtension,
      propSchemas: imageDesignerPropSchemas,
      localeMessages: imageLocaleMessages,
    },
    {
      ...barcodeModel,
      name: 'materials.barcode.name',
      icon: IconBarcode,
      category: 'basic',
      aiDescriptor: barcodeAIMaterialDescriptor,
      factory: createBarcodeExtension,
      propSchemas: barcodeDesignerPropSchemas,
      localeMessages: barcodeLocaleMessages,
    },
    {
      ...qrcodeModel,
      name: 'materials.qrcode.name',
      icon: IconQrcode,
      category: 'basic',
      aiDescriptor: qrcodeAIMaterialDescriptor,
      factory: createQrcodeExtension,
      propSchemas: qrcodeDesignerPropSchemas,
      localeMessages: qrcodeLocaleMessages,
    },
    {
      ...lineModel,
      name: 'materials.line.name',
      icon: IconLine,
      category: 'basic',
      aiDescriptor: lineAIMaterialDescriptor,
      factory: createLineExtension,
      propSchemas: lineDesignerPropSchemas,
      localeMessages: lineLocaleMessages,
    },
    {
      ...rectModel,
      name: 'materials.rect.name',
      icon: IconRect,
      category: 'basic',
      aiDescriptor: rectAIMaterialDescriptor,
      factory: createRectExtension,
      propSchemas: rectDesignerPropSchemas,
      localeMessages: rectLocaleMessages,
    },
    {
      ...signatureModel,
      name: 'materials.signature.name',
      icon: IconSignature,
      category: 'basic',
      aiDescriptor: signatureAIMaterialDescriptor,
      factory: createSignatureExtension,
      propSchemas: signatureDesignerPropSchemas,
      localeMessages: signatureLocaleMessages,
    },
    {
      ...ellipseModel,
      name: 'materials.ellipse.name',
      icon: IconEllipse,
      category: 'basic',
      aiDescriptor: ellipseAIMaterialDescriptor,
      factory: createEllipseExtension,
      propSchemas: ellipseDesignerPropSchemas,
      localeMessages: ellipseLocaleMessages,
    },
    {
      ...tableStaticModel,
      name: 'materials.tableStatic.name',
      icon: IconTable,
      category: 'data',
      aiDescriptor: tableStaticAIMaterialDescriptor,
      factory: createTableStaticExtension,
      propSchemas: tableStaticDesignerPropSchemas,
      localeMessages: tableStaticLocaleMessages,
      sectionFilter: tableSectionFilter,
    },
    {
      ...tableDataModel,
      name: 'materials.tableData.name',
      icon: IconDataTable,
      category: 'data',
      aiDescriptor: tableDataAIMaterialDescriptor,
      factory: createTableDataExtension,
      propSchemas: tableDataDesignerPropSchemas,
      localeMessages: tableDataLocaleMessages,
      sectionFilter: tableSectionFilter,
    },
    {
      ...flowRowModel,
      name: 'materials.flowRow.name',
      icon: IconLayoutPanelTop,
      category: 'data',
      aiDescriptor: flowRowAIMaterialDescriptor,
      factory: createFlowRowExtension,
      propSchemas: flowRowDesignerPropSchemas,
      localeMessages: flowRowLocaleMessages,
    },
    {
      ...ringProgressModel,
      name: 'materials.ringProgress.name',
      icon: IconRingProgress,
      category: 'data',
      aiDescriptor: ringProgressAIMaterialDescriptor,
      factory: createRingProgressExtension,
      propSchemas: ringProgressDesignerPropSchemas,
      localeMessages: ringProgressLocaleMessages,
    },
    {
      ...progressModel,
      name: 'materials.progress.name',
      icon: IconProgress,
      category: 'data',
      aiDescriptor: progressAIMaterialDescriptor,
      factory: createProgressExtension,
      propSchemas: progressDesignerPropSchemas,
      localeMessages: progressLocaleMessages,
    },
    {
      ...ratingModel,
      name: 'materials.rating.name',
      icon: IconRating,
      category: 'data',
      aiDescriptor: ratingAIMaterialDescriptor,
      factory: createRatingExtension,
      propSchemas: ratingDesignerPropSchemas,
      localeMessages: ratingLocaleMessages,
    },
    {
      ...chartBarModel,
      name: 'materials.chartBar.name',
      icon: IconChartBar,
      category: 'chart',
      aiDescriptor: chartBarAIMaterialDescriptor,
      factory: createChartBarExtension,
      propSchemas: chartBarDesignerPropSchemas,
      localeMessages: chartBarLocaleMessages,
    },
    {
      ...chartLineModel,
      name: 'materials.chartLine.name',
      icon: IconChartLine,
      category: 'chart',
      aiDescriptor: chartLineAIMaterialDescriptor,
      factory: createChartLineExtension,
      propSchemas: chartLineDesignerPropSchemas,
      localeMessages: chartLineLocaleMessages,
    },
    {
      ...chartPieModel,
      name: 'materials.chartPie.name',
      icon: IconChartPie,
      category: 'chart',
      aiDescriptor: chartPieAIMaterialDescriptor,
      factory: createChartPieExtension,
      propSchemas: chartPieDesignerPropSchemas,
      localeMessages: chartPieLocaleMessages,
    },
    {
      ...chartRadarModel,
      name: 'materials.chartRadar.name',
      icon: IconChartRadar,
      category: 'chart',
      aiDescriptor: chartRadarAIMaterialDescriptor,
      factory: createChartRadarExtension,
      propSchemas: chartRadarDesignerPropSchemas,
      localeMessages: chartRadarLocaleMessages,
    },
    {
      ...chartScatterModel,
      name: 'materials.chartScatter.name',
      icon: IconChartScatter,
      category: 'chart',
      aiDescriptor: chartScatterAIMaterialDescriptor,
      factory: createChartScatterExtension,
      propSchemas: chartScatterDesignerPropSchemas,
      localeMessages: chartScatterLocaleMessages,
    },
    {
      ...chartGaugeModel,
      name: 'materials.chartGauge.name',
      icon: IconChartGauge,
      category: 'chart',
      aiDescriptor: chartGaugeAIMaterialDescriptor,
      factory: createChartGaugeExtension,
      propSchemas: chartGaugeDesignerPropSchemas,
      localeMessages: chartGaugeLocaleMessages,
    },
    {
      ...chartCustomModel,
      name: 'materials.chartCustom.name',
      icon: IconChartCustom,
      category: 'chart',
      aiDescriptor: chartCustomAIMaterialDescriptor,
      factory: () => ({ renderContent: () => () => {} }),
      lazyFactory: async () => (await import('@easyink/material-chart-custom/designer')).createChartCustomExtension,
      propSchemas: chartCustomDesignerPropSchemas,
      localeMessages: chartCustomLocaleMessages,
    },
    {
      ...svgCustomModel,
      name: 'materials.svgCustom.name',
      icon: IconSvg,
      category: 'svg',
      aiDescriptor: svgCustomAIMaterialDescriptor,
      factory: createSvgCustomExtension,
      propSchemas: svgCustomDesignerPropSchemas,
      localeMessages: svgCustomLocaleMessages,
    },
    {
      ...svgStarModel,
      name: 'materials.svgStar.name',
      icon: IconStar,
      category: 'svg',
      aiDescriptor: svgStarAIMaterialDescriptor,
      factory: createSvgStarExtension,
      propSchemas: svgStarDesignerPropSchemas,
      localeMessages: svgStarLocaleMessages,
    },
    {
      ...svgHeartModel,
      name: 'materials.svgHeart.name',
      icon: IconHeart,
      category: 'svg',
      aiDescriptor: svgHeartAIMaterialDescriptor,
      factory: createSvgHeartExtension,
      propSchemas: svgHeartDesignerPropSchemas,
      localeMessages: svgHeartLocaleMessages,
    },
    {
      ...pageNumberModel,
      name: 'materials.pageNumber.name',
      icon: IconPageNumber,
      category: 'utility',
      aiDescriptor: pageNumberAIMaterialDescriptor,
      factory: createPageNumberExtension,
      propSchemas: pageNumberDesignerPropSchemas,
      localeMessages: pageNumberLocaleMessages,
    },
  ],
  catalogs: [
    {
      id: 'basic',
      label: 'materials.catalog.basic',
      order: 10,
      items: [
        { type: LINE_TYPE },
        { type: RECT_TYPE },
        { type: ELLIPSE_TYPE },
        { type: TEXT_TYPE },
        { type: IMAGE_TYPE },
        { type: QRCODE_TYPE },
        { type: BARCODE_TYPE },
        { type: SIGNATURE_TYPE },
      ],
    },
    {
      id: 'data',
      label: 'materials.catalog.data',
      order: 20,
      items: [
        { type: TABLE_STATIC_TYPE },
        { type: TABLE_DATA_TYPE },
        { type: FLOW_ROW_TYPE },
        { type: RING_PROGRESS_TYPE },
        { type: PROGRESS_TYPE },
        { type: RATING_TYPE },
      ],
    },
    {
      id: 'chart',
      label: 'materials.catalog.chart',
      order: 30,
      items: [
        { type: CHART_BAR_TYPE },
        { type: CHART_LINE_TYPE },
        { type: CHART_PIE_TYPE },
        { type: CHART_RADAR_TYPE },
        { type: CHART_SCATTER_TYPE },
        { type: CHART_GAUGE_TYPE },
        { type: CHART_CUSTOM_TYPE },
      ],
    },
    {
      id: 'svg',
      label: 'materials.catalog.svg',
      order: 40,
      items: [
        { type: SVG_STAR_TYPE },
        { type: SVG_HEART_TYPE },
        { type: SVG_CUSTOM_TYPE },
      ],
    },
    {
      id: 'utility',
      label: 'materials.catalog.utility',
      order: 50,
      items: [
        { type: PAGE_NUMBER_TYPE },
      ],
    },
  ],
}

export function createBuiltinDesignerMaterialBundle(set: BuiltinMaterialSet = 'all'): BuiltinDesignerMaterialBundle {
  if (set === 'none') {
    return {
      materials: [],
      catalogs: [],
    }
  }

  if (set === 'basic') {
    return filterBuiltinDesignerMaterialBundle(material =>
      material.category !== 'chart' && material.type !== SIGNATURE_TYPE,
    )
  }

  return cloneBuiltinDesignerMaterialBundle(ALL_BUILTIN_DESIGNER_MATERIAL_BUNDLE)
}

export const builtinDesignerMaterialSets = {
  all: createBuiltinDesignerMaterialBundle('all'),
  basic: createBuiltinDesignerMaterialBundle('basic'),
  none: createBuiltinDesignerMaterialBundle('none'),
} satisfies Record<BuiltinMaterialSet, BuiltinDesignerMaterialBundle>

function filterBuiltinDesignerMaterialBundle(predicate: (material: BuiltinDesignerMaterialBundle['materials'][number]) => boolean): BuiltinDesignerMaterialBundle {
  const materials = ALL_BUILTIN_DESIGNER_MATERIAL_BUNDLE.materials.filter(predicate)
  const materialTypes = new Set(materials.map(material => material.type))

  return {
    localeMessages: ALL_BUILTIN_DESIGNER_MATERIAL_BUNDLE.localeMessages,
    materials,
    catalogs: ALL_BUILTIN_DESIGNER_MATERIAL_BUNDLE.catalogs
      .map(group => ({
        ...group,
        items: group.items.filter(entry => materialTypes.has(entry.type)),
      }))
      .filter(group => group.items.length > 0),
  }
}

function cloneBuiltinDesignerMaterialBundle(bundle: BuiltinDesignerMaterialBundle): BuiltinDesignerMaterialBundle {
  return {
    localeMessages: bundle.localeMessages,
    materials: [...bundle.materials],
    catalogs: bundle.catalogs.map(group => ({
      ...group,
      items: [...group.items],
    })),
  }
}
