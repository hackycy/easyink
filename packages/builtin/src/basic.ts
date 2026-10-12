import type {
  BuiltinDesignerMaterialBundle,
  BuiltinLocaleMessages,
  BuiltinPanelSectionId,
  BuiltinViewerMaterialBundle,
  BuiltinViewerRegistrar,
} from './types'
import {
  IconBarcode,
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
  renderBarcode,
} from '@easyink/material-barcode'
import { barcodeModel } from '@easyink/material-barcode/material-model'
import {
  createEllipseExtension,
  ELLIPSE_TYPE,
  ellipseAIMaterialDescriptor,
  ellipseDesignerPropSchemas,
  ellipseLocaleMessages,
  renderEllipse,
} from '@easyink/material-ellipse'
import { ellipseModel } from '@easyink/material-ellipse/material-model'
import {
  createFlowRowExtension,
  FLOW_ROW_TYPE,
  flowRowAIMaterialDescriptor,
  flowRowDesignerPropSchemas,
  flowRowLocaleMessages,
  measureFlowRow,
  renderFlowRow,
} from '@easyink/material-flow-row'
import { flowRowModel } from '@easyink/material-flow-row/material-model'
import {
  createImageExtension,
  IMAGE_TYPE,
  imageAIMaterialDescriptor,
  imageDesignerPropSchemas,
  imageLocaleMessages,
  renderImage,
} from '@easyink/material-image'
import { imageModel } from '@easyink/material-image/material-model'
import {
  createLineExtension,
  createLineViewerExtension,
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
  renderPageNumber,
} from '@easyink/material-page-number'
import { pageNumberModel } from '@easyink/material-page-number/material-model'
import {
  createProgressExtension,
  PROGRESS_TYPE,
  progressAIMaterialDescriptor,
  progressDesignerPropSchemas,
  progressLocaleMessages,
  renderProgress,
} from '@easyink/material-progress'
import { progressModel } from '@easyink/material-progress/material-model'
import {
  createQrcodeExtension,
  QRCODE_TYPE,
  qrcodeAIMaterialDescriptor,
  qrcodeDesignerPropSchemas,
  qrcodeLocaleMessages,
  renderQrcode,
} from '@easyink/material-qrcode'
import { qrcodeModel } from '@easyink/material-qrcode/material-model'
import {
  createRatingExtension,
  RATING_TYPE,
  ratingAIMaterialDescriptor,
  ratingDesignerPropSchemas,
  ratingLocaleMessages,
  renderRating,
} from '@easyink/material-rating'
import { ratingModel } from '@easyink/material-rating/material-model'
import {
  createRectExtension,
  RECT_TYPE,
  rectAIMaterialDescriptor,
  rectDesignerPropSchemas,
  rectLocaleMessages,
  renderRect,
} from '@easyink/material-rect'
import { rectModel } from '@easyink/material-rect/material-model'
import {
  createRingProgressExtension,
  renderRingProgress,
  RING_PROGRESS_TYPE,
  ringProgressAIMaterialDescriptor,
  ringProgressDesignerPropSchemas,
  ringProgressLocaleMessages,
} from '@easyink/material-ring-progress'
import { ringProgressModel } from '@easyink/material-ring-progress/material-model'
import {
  createSvgCustomExtension,
  renderSvgCustom,
  SVG_CUSTOM_TYPE,
  svgCustomAIMaterialDescriptor,
  svgCustomDesignerPropSchemas,
  svgCustomLocaleMessages,
} from '@easyink/material-svg-custom'
import { svgCustomModel } from '@easyink/material-svg-custom/material-model'
import {
  createSvgHeartExtension,
  renderSvgHeart,
  SVG_HEART_TYPE,
  svgHeartAIMaterialDescriptor,
  svgHeartDesignerPropSchemas,
  svgHeartLocaleMessages,
} from '@easyink/material-svg-heart'
import { svgHeartModel } from '@easyink/material-svg-heart/material-model'
import {
  createSvgStarExtension,
  renderSvgStar,
  SVG_STAR_TYPE,
  svgStarAIMaterialDescriptor,
  svgStarDesignerPropSchemas,
  svgStarLocaleMessages,
} from '@easyink/material-svg-star'
import { svgStarModel } from '@easyink/material-svg-star/material-model'
import {
  createTableDataExtension,
  measureTableData,
  renderTableData,
  TABLE_DATA_TYPE,
  tableDataAIMaterialDescriptor,
  tableDataDesignerPropSchemas,
  tableDataLocaleMessages,
} from '@easyink/material-table-data'
import { tableDataModel } from '@easyink/material-table-data/material-model'
import { tableKernelLocaleMessages } from '@easyink/material-table-kernel'
import {
  createTableStaticExtension,
  renderTableStatic,
  TABLE_STATIC_TYPE,
  tableStaticAIMaterialDescriptor,
  tableStaticDesignerPropSchemas,
  tableStaticLocaleMessages,
} from '@easyink/material-table-static'
import { tableStaticModel } from '@easyink/material-table-static/material-model'
import {
  createTextExtension,
  getTextRenderSize,
  measureText,
  renderText,
  TEXT_TYPE,
  textAIMaterialDescriptor,
  textDesignerPropSchemas,
  textLocaleMessages,
} from '@easyink/material-text'
import { textModel } from '@easyink/material-text/material-model'
import {
  barcodeMaterialBinding,
  customMaterialBinding,
  imageMaterialBinding,
  noMaterialBinding,
  progressMaterialBinding,
  qrcodeMaterialBinding,
  ratingMaterialBinding,
  ringProgressMaterialBinding,
  svgCustomMaterialBinding,
} from './bindings'

export { materials } from './basic/designer'

function tableSectionFilter(sectionId: BuiltinPanelSectionId): boolean {
  return sectionId !== 'binding'
}

const builtinCatalogLocaleMessages = {
  messages: {
    materials: {
      catalog: {
        basic: '基础',
        data: '数据',
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

export const builtinDesignerMaterialBundle: BuiltinDesignerMaterialBundle = {
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

export const builtinDesignerMaterials = builtinDesignerMaterialBundle.materials

export const builtinViewerMaterialBundle: BuiltinViewerMaterialBundle = {
  materials: [
    {
      ...textModel,
      extension: {
        render: (node, ctx) => renderText(node, ctx),
        measure: (node, ctx) => measureText(node, ctx),
        getRenderSize: (node, ctx) => getTextRenderSize(node, ctx),
      },
    },
    { type: IMAGE_TYPE, binding: imageMaterialBinding, extension: { render: (node, ctx) => renderImage(node, ctx.unit) } },
    { type: BARCODE_TYPE, binding: barcodeMaterialBinding, extension: { render: (node, ctx) => renderBarcode(node, ctx) } },
    { type: QRCODE_TYPE, binding: qrcodeMaterialBinding, extension: { render: node => renderQrcode(node) } },
    { type: LINE_TYPE, binding: noMaterialBinding, extension: createLineViewerExtension() },
    { type: RECT_TYPE, binding: noMaterialBinding, extension: { render: (node, ctx) => renderRect(node, ctx.unit) } },
    { type: ELLIPSE_TYPE, binding: noMaterialBinding, extension: { render: (node, ctx) => renderEllipse(node, ctx.unit) } },
    { type: TABLE_STATIC_TYPE, binding: customMaterialBinding, extension: { render: (node, ctx) => renderTableStatic(node, ctx) } },
    {
      ...tableDataModel,
      extension: {
        render: (node, ctx) => renderTableData(node, ctx),
        measure: (node, ctx) => measureTableData(node, ctx),
      },
    },
    {
      ...flowRowModel,
      extension: {
        render: (node, ctx) => renderFlowRow(node, ctx),
        measure: (node, ctx) => measureFlowRow(node, ctx),
      },
    },
    { type: RING_PROGRESS_TYPE, binding: ringProgressMaterialBinding, extension: { render: (node, ctx) => renderRingProgress(node, ctx) } },
    { type: PROGRESS_TYPE, binding: progressMaterialBinding, extension: { render: (node, ctx) => renderProgress(node, ctx) } },
    { type: RATING_TYPE, binding: ratingMaterialBinding, extension: { render: (node, ctx) => renderRating(node, ctx) } },
    { type: SVG_CUSTOM_TYPE, binding: svgCustomMaterialBinding, extension: { render: node => renderSvgCustom(node) } },
    { type: SVG_STAR_TYPE, binding: noMaterialBinding, extension: { render: node => renderSvgStar(node) } },
    { type: SVG_HEART_TYPE, binding: noMaterialBinding, extension: { render: (node, ctx) => renderSvgHeart(node, ctx.unit) } },
    {
      ...pageNumberModel,
      extension: {
        render: (node, ctx) => renderPageNumber(node, ctx),
        pageAware: true,
      },
    },
  ],
}

export const builtinViewerMaterials = builtinViewerMaterialBundle.materials

export function registerBuiltinViewerMaterials(register: BuiltinViewerRegistrar): void {
  for (const material of builtinViewerMaterials)
    register(material.type, material.binding, material.extension)
}
export type {
  BuiltinDesignerCatalogGroupRegistration,
  BuiltinDesignerCatalogRegistration,
  BuiltinDesignerMaterialBundle,
  BuiltinDesignerMaterialRegistration,
  BuiltinLocaleMessages,
  BuiltinMaterialSet,
  BuiltinViewerMaterialBundle,
  BuiltinViewerMaterialRegistration,
  BuiltinViewerRegistrar,
} from './types'
