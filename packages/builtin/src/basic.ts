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
  BARCODE_CAPABILITIES,
  BARCODE_TYPE,
  barcodeAIMaterialDescriptor,
  barcodeDesignerPropSchemas,
  barcodeLocaleMessages,
  createBarcodeExtension,
  createBarcodeNode,
  renderBarcode,
} from '@easyink/material-barcode'
import {
  createEllipseExtension,
  createEllipseNode,
  ELLIPSE_CAPABILITIES,
  ELLIPSE_TYPE,
  ellipseAIMaterialDescriptor,
  ellipseDesignerPropSchemas,
  ellipseLocaleMessages,
  renderEllipse,
} from '@easyink/material-ellipse'
import {
  createFlowRowExtension,
  createFlowRowNode,
  FLOW_ROW_CAPABILITIES,
  FLOW_ROW_TYPE,
  flowRowAIMaterialDescriptor,
  flowRowDesignerPropSchemas,
  flowRowLocaleMessages,
  measureFlowRow,
  renderFlowRow,
} from '@easyink/material-flow-row'
import {
  createImageExtension,
  createImageNode,
  IMAGE_CAPABILITIES,
  IMAGE_TYPE,
  imageAIMaterialDescriptor,
  imageDesignerPropSchemas,
  imageLocaleMessages,
  renderImage,
} from '@easyink/material-image'
import {
  createLineExtension,
  createLineNode,
  createLineViewerExtension,
  LINE_CAPABILITIES,
  LINE_TYPE,
  lineAIMaterialDescriptor,
  lineDesignerPropSchemas,
  lineLocaleMessages,
} from '@easyink/material-line'
import {
  createPageNumberExtension,
  createPageNumberNode,
  PAGE_NUMBER_CAPABILITIES,
  PAGE_NUMBER_TYPE,
  pageNumberAIMaterialDescriptor,
  pageNumberDesignerPropSchemas,
  pageNumberLocaleMessages,
  renderPageNumber,
} from '@easyink/material-page-number'
import {
  createProgressExtension,
  createProgressNode,
  PROGRESS_CAPABILITIES,
  PROGRESS_TYPE,
  progressAIMaterialDescriptor,
  progressDesignerPropSchemas,
  progressLocaleMessages,
  renderProgress,
} from '@easyink/material-progress'
import {
  createQrcodeExtension,
  createQrcodeNode,
  QRCODE_CAPABILITIES,
  QRCODE_TYPE,
  qrcodeAIMaterialDescriptor,
  qrcodeDesignerPropSchemas,
  qrcodeLocaleMessages,
  renderQrcode,
} from '@easyink/material-qrcode'
import {
  createRatingExtension,
  createRatingNode,
  RATING_CAPABILITIES,
  RATING_TYPE,
  ratingAIMaterialDescriptor,
  ratingDesignerPropSchemas,
  ratingLocaleMessages,
  renderRating,
} from '@easyink/material-rating'
import {
  createRectExtension,
  createRectNode,
  RECT_CAPABILITIES,
  RECT_TYPE,
  rectAIMaterialDescriptor,
  rectDesignerPropSchemas,
  rectLocaleMessages,
  renderRect,
} from '@easyink/material-rect'
import {
  createRingProgressExtension,
  createRingProgressNode,
  renderRingProgress,
  RING_PROGRESS_CAPABILITIES,
  RING_PROGRESS_TYPE,
  ringProgressAIMaterialDescriptor,
  ringProgressDesignerPropSchemas,
  ringProgressLocaleMessages,
} from '@easyink/material-ring-progress'
import {
  createSvgCustomExtension,
  createSvgCustomNode,
  renderSvgCustom,
  SVG_CUSTOM_CAPABILITIES,
  SVG_CUSTOM_TYPE,
  svgCustomAIMaterialDescriptor,
  svgCustomDesignerPropSchemas,
  svgCustomLocaleMessages,
} from '@easyink/material-svg-custom'
import {
  createSvgHeartExtension,
  createSvgHeartNode,
  renderSvgHeart,
  SVG_HEART_CAPABILITIES,
  SVG_HEART_TYPE,
  svgHeartAIMaterialDescriptor,
  svgHeartDesignerPropSchemas,
  svgHeartLocaleMessages,
} from '@easyink/material-svg-heart'
import {
  createSvgStarExtension,
  createSvgStarNode,
  renderSvgStar,
  SVG_STAR_CAPABILITIES,
  SVG_STAR_TYPE,
  svgStarAIMaterialDescriptor,
  svgStarDesignerPropSchemas,
  svgStarLocaleMessages,
} from '@easyink/material-svg-star'
import {
  createTableDataExtension,
  createTableDataNode,
  measureTableData,
  renderTableData,
  TABLE_DATA_CAPABILITIES,
  TABLE_DATA_TYPE,
  tableDataAIMaterialDescriptor,
  tableDataDesignerPropSchemas,
  tableDataFragmentPaginator,
  tableDataLocaleMessages,
} from '@easyink/material-table-data'
import { tableKernelLocaleMessages } from '@easyink/material-table-kernel'
import {
  createTableStaticExtension,
  createTableStaticNode,
  renderTableStatic,
  TABLE_STATIC_CAPABILITIES,
  TABLE_STATIC_TYPE,
  tableStaticAIMaterialDescriptor,
  tableStaticDesignerPropSchemas,
  tableStaticLocaleMessages,
} from '@easyink/material-table-static'
import {
  createTextExtension,
  createTextNode,
  getTextRenderSize,
  measureText,
  renderText,
  TEXT_CAPABILITIES,
  TEXT_TYPE,
  textAIMaterialDescriptor,
  textDesignerPropSchemas,
  textLocaleMessages,
} from '@easyink/material-text'
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
  textMaterialBinding,
} from './bindings'

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
      type: TEXT_TYPE,
      name: 'materials.text.name',
      icon: IconText,
      category: 'basic',
      capabilities: TEXT_CAPABILITIES,
      binding: textMaterialBinding,
      aiDescriptor: textAIMaterialDescriptor,
      createDefaultNode: createTextNode,
      factory: createTextExtension,
      propSchemas: textDesignerPropSchemas,
      localeMessages: textLocaleMessages,
    },
    {
      type: IMAGE_TYPE,
      name: 'materials.image.name',
      icon: IconImage,
      category: 'basic',
      capabilities: IMAGE_CAPABILITIES,
      binding: imageMaterialBinding,
      aiDescriptor: imageAIMaterialDescriptor,
      createDefaultNode: createImageNode,
      factory: createImageExtension,
      propSchemas: imageDesignerPropSchemas,
      localeMessages: imageLocaleMessages,
    },
    {
      type: BARCODE_TYPE,
      name: 'materials.barcode.name',
      icon: IconBarcode,
      category: 'basic',
      capabilities: BARCODE_CAPABILITIES,
      binding: barcodeMaterialBinding,
      aiDescriptor: barcodeAIMaterialDescriptor,
      createDefaultNode: createBarcodeNode,
      factory: createBarcodeExtension,
      propSchemas: barcodeDesignerPropSchemas,
      localeMessages: barcodeLocaleMessages,
    },
    {
      type: QRCODE_TYPE,
      name: 'materials.qrcode.name',
      icon: IconQrcode,
      category: 'basic',
      capabilities: QRCODE_CAPABILITIES,
      binding: qrcodeMaterialBinding,
      aiDescriptor: qrcodeAIMaterialDescriptor,
      createDefaultNode: createQrcodeNode,
      factory: createQrcodeExtension,
      propSchemas: qrcodeDesignerPropSchemas,
      localeMessages: qrcodeLocaleMessages,
    },
    {
      type: LINE_TYPE,
      name: 'materials.line.name',
      icon: IconLine,
      category: 'basic',
      capabilities: LINE_CAPABILITIES,
      binding: noMaterialBinding,
      aiDescriptor: lineAIMaterialDescriptor,
      createDefaultNode: createLineNode,
      factory: createLineExtension,
      propSchemas: lineDesignerPropSchemas,
      localeMessages: lineLocaleMessages,
    },
    {
      type: RECT_TYPE,
      name: 'materials.rect.name',
      icon: IconRect,
      category: 'basic',
      capabilities: RECT_CAPABILITIES,
      binding: noMaterialBinding,
      aiDescriptor: rectAIMaterialDescriptor,
      createDefaultNode: createRectNode,
      factory: createRectExtension,
      propSchemas: rectDesignerPropSchemas,
      localeMessages: rectLocaleMessages,
    },
    {
      type: ELLIPSE_TYPE,
      name: 'materials.ellipse.name',
      icon: IconEllipse,
      category: 'basic',
      capabilities: ELLIPSE_CAPABILITIES,
      binding: noMaterialBinding,
      aiDescriptor: ellipseAIMaterialDescriptor,
      createDefaultNode: createEllipseNode,
      factory: createEllipseExtension,
      propSchemas: ellipseDesignerPropSchemas,
      localeMessages: ellipseLocaleMessages,
    },
    {
      type: TABLE_STATIC_TYPE,
      name: 'materials.tableStatic.name',
      icon: IconTable,
      category: 'data',
      capabilities: TABLE_STATIC_CAPABILITIES,
      binding: customMaterialBinding,
      aiDescriptor: tableStaticAIMaterialDescriptor,
      createDefaultNode: createTableStaticNode,
      factory: createTableStaticExtension,
      propSchemas: tableStaticDesignerPropSchemas,
      localeMessages: tableStaticLocaleMessages,
      sectionFilter: tableSectionFilter,
    },
    {
      type: TABLE_DATA_TYPE,
      name: 'materials.tableData.name',
      icon: IconDataTable,
      category: 'data',
      capabilities: TABLE_DATA_CAPABILITIES,
      binding: customMaterialBinding,
      aiDescriptor: tableDataAIMaterialDescriptor,
      createDefaultNode: createTableDataNode,
      factory: createTableDataExtension,
      propSchemas: tableDataDesignerPropSchemas,
      localeMessages: tableDataLocaleMessages,
      sectionFilter: tableSectionFilter,
    },
    {
      type: FLOW_ROW_TYPE,
      name: 'materials.flowRow.name',
      icon: IconLayoutPanelTop,
      category: 'data',
      capabilities: FLOW_ROW_CAPABILITIES,
      binding: customMaterialBinding,
      aiDescriptor: flowRowAIMaterialDescriptor,
      createDefaultNode: createFlowRowNode,
      factory: createFlowRowExtension,
      propSchemas: flowRowDesignerPropSchemas,
      localeMessages: flowRowLocaleMessages,
    },
    {
      type: RING_PROGRESS_TYPE,
      name: 'materials.ringProgress.name',
      icon: IconRingProgress,
      category: 'data',
      capabilities: RING_PROGRESS_CAPABILITIES,
      binding: ringProgressMaterialBinding,
      aiDescriptor: ringProgressAIMaterialDescriptor,
      createDefaultNode: createRingProgressNode,
      factory: createRingProgressExtension,
      propSchemas: ringProgressDesignerPropSchemas,
      localeMessages: ringProgressLocaleMessages,
    },
    {
      type: PROGRESS_TYPE,
      name: 'materials.progress.name',
      icon: IconProgress,
      category: 'data',
      capabilities: PROGRESS_CAPABILITIES,
      binding: progressMaterialBinding,
      aiDescriptor: progressAIMaterialDescriptor,
      createDefaultNode: createProgressNode,
      factory: createProgressExtension,
      propSchemas: progressDesignerPropSchemas,
      localeMessages: progressLocaleMessages,
    },
    {
      type: RATING_TYPE,
      name: 'materials.rating.name',
      icon: IconRating,
      category: 'data',
      capabilities: RATING_CAPABILITIES,
      binding: ratingMaterialBinding,
      aiDescriptor: ratingAIMaterialDescriptor,
      createDefaultNode: createRatingNode,
      factory: createRatingExtension,
      propSchemas: ratingDesignerPropSchemas,
      localeMessages: ratingLocaleMessages,
    },
    {
      type: SVG_CUSTOM_TYPE,
      name: 'materials.svgCustom.name',
      icon: IconSvg,
      category: 'svg',
      capabilities: SVG_CUSTOM_CAPABILITIES,
      binding: svgCustomMaterialBinding,
      aiDescriptor: svgCustomAIMaterialDescriptor,
      createDefaultNode: createSvgCustomNode,
      factory: createSvgCustomExtension,
      propSchemas: svgCustomDesignerPropSchemas,
      localeMessages: svgCustomLocaleMessages,
    },
    {
      type: SVG_STAR_TYPE,
      name: 'materials.svgStar.name',
      icon: IconStar,
      category: 'svg',
      capabilities: SVG_STAR_CAPABILITIES,
      binding: noMaterialBinding,
      aiDescriptor: svgStarAIMaterialDescriptor,
      createDefaultNode: createSvgStarNode,
      factory: createSvgStarExtension,
      propSchemas: svgStarDesignerPropSchemas,
      localeMessages: svgStarLocaleMessages,
    },
    {
      type: SVG_HEART_TYPE,
      name: 'materials.svgHeart.name',
      icon: IconHeart,
      category: 'svg',
      capabilities: SVG_HEART_CAPABILITIES,
      binding: noMaterialBinding,
      aiDescriptor: svgHeartAIMaterialDescriptor,
      createDefaultNode: createSvgHeartNode,
      factory: createSvgHeartExtension,
      propSchemas: svgHeartDesignerPropSchemas,
      localeMessages: svgHeartLocaleMessages,
    },
    {
      type: PAGE_NUMBER_TYPE,
      name: 'materials.pageNumber.name',
      icon: IconPageNumber,
      category: 'utility',
      capabilities: PAGE_NUMBER_CAPABILITIES,
      binding: noMaterialBinding,
      aiDescriptor: pageNumberAIMaterialDescriptor,
      createDefaultNode: createPageNumberNode,
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

export const builtinViewerMaterials = builtinViewerMaterialBundle.materials

export function registerBuiltinViewerMaterials(register: BuiltinViewerRegistrar): void {
  const materialBindingKey = 'binding'
  for (const material of builtinViewerMaterials)
    register(material.type, material[materialBindingKey], material.extension)
}
