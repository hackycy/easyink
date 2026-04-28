import type { BuiltinDesignerMaterialBundle, BuiltinPanelSectionId } from './types'
import {
  BARCODE_CAPABILITIES,
  BARCODE_TYPE,
  createBarcodeExtension,
  createBarcodeNode,
} from '@easyink/material-barcode'
import {
  CHART_CAPABILITIES,
  CHART_TYPE,
  createChartExtension,
  createChartNode,
} from '@easyink/material-chart'
import {
  CONTAINER_CAPABILITIES,
  CONTAINER_TYPE,
  createContainerExtension,
  createContainerNode,
} from '@easyink/material-container'
import {
  createEllipseExtension,
  createEllipseNode,
  ELLIPSE_CAPABILITIES,
  ELLIPSE_TYPE,
} from '@easyink/material-ellipse'
import {
  createImageExtension,
  createImageNode,
  IMAGE_CAPABILITIES,
  IMAGE_TYPE,
} from '@easyink/material-image'
import {
  createLineExtension,
  createLineNode,
  LINE_CAPABILITIES,
  LINE_TYPE,
} from '@easyink/material-line'
import {
  createPageNumberExtension,
  createPageNumberNode,
  PAGE_NUMBER_CAPABILITIES,
  PAGE_NUMBER_TYPE,
} from '@easyink/material-page-number'
import {
  createQrcodeExtension,
  createQrcodeNode,
  QRCODE_CAPABILITIES,
  QRCODE_TYPE,
} from '@easyink/material-qrcode'
import {
  createRectExtension,
  createRectNode,
  RECT_CAPABILITIES,
  RECT_TYPE,
} from '@easyink/material-rect'
import {
  createSvgExtension,
  createSvgNode,
  SVG_CAPABILITIES,
  SVG_TYPE,
} from '@easyink/material-svg'
import {
  createTableDataExtension,
  createTableDataNode,
  TABLE_DATA_CAPABILITIES,
  TABLE_DATA_TYPE,
  tableDataDesignerPropSchemas,
} from '@easyink/material-table-data'
import {
  createTableStaticExtension,
  createTableStaticNode,
  TABLE_STATIC_CAPABILITIES,
  TABLE_STATIC_TYPE,
} from '@easyink/material-table-static'
import {
  createTextExtension,
  createTextNode,
  TEXT_CAPABILITIES,
  TEXT_TYPE,
} from '@easyink/material-text'

function tableSectionFilter(sectionId: BuiltinPanelSectionId): boolean {
  return sectionId !== 'binding'
}

export const builtinDesignerMaterialBundle: BuiltinDesignerMaterialBundle = {
  materials: [
    {
      type: TEXT_TYPE,
      name: 'designer.toolbar.text',
      icon: 'text',
      category: 'basic',
      capabilities: TEXT_CAPABILITIES,
      createDefaultNode: createTextNode,
      factory: createTextExtension,
    },
    {
      type: IMAGE_TYPE,
      name: 'designer.toolbar.image',
      icon: 'image',
      category: 'basic',
      capabilities: IMAGE_CAPABILITIES,
      createDefaultNode: createImageNode,
      factory: createImageExtension,
    },
    {
      type: BARCODE_TYPE,
      name: 'designer.toolbar.barcode',
      icon: 'barcode',
      category: 'basic',
      capabilities: BARCODE_CAPABILITIES,
      createDefaultNode: createBarcodeNode,
      factory: createBarcodeExtension,
    },
    {
      type: QRCODE_TYPE,
      name: 'designer.toolbar.qrcode',
      icon: 'qrcode',
      category: 'basic',
      capabilities: QRCODE_CAPABILITIES,
      createDefaultNode: createQrcodeNode,
      factory: createQrcodeExtension,
    },
    {
      type: LINE_TYPE,
      name: 'designer.toolbar.line',
      icon: 'line',
      category: 'basic',
      capabilities: LINE_CAPABILITIES,
      createDefaultNode: createLineNode,
      factory: createLineExtension,
    },
    {
      type: RECT_TYPE,
      name: 'designer.toolbar.rect',
      icon: 'rect',
      category: 'basic',
      capabilities: RECT_CAPABILITIES,
      createDefaultNode: createRectNode,
      factory: createRectExtension,
    },
    {
      type: ELLIPSE_TYPE,
      name: 'designer.toolbar.ellipse',
      icon: 'ellipse',
      category: 'basic',
      capabilities: ELLIPSE_CAPABILITIES,
      createDefaultNode: createEllipseNode,
      factory: createEllipseExtension,
    },
    {
      type: CONTAINER_TYPE,
      name: 'designer.toolbar.container',
      icon: 'container',
      category: 'layout',
      capabilities: CONTAINER_CAPABILITIES,
      createDefaultNode: createContainerNode,
      factory: createContainerExtension,
    },
    {
      type: TABLE_STATIC_TYPE,
      name: 'designer.toolbar.table',
      icon: 'table-static',
      category: 'data',
      capabilities: TABLE_STATIC_CAPABILITIES,
      createDefaultNode: createTableStaticNode,
      factory: createTableStaticExtension,
      sectionFilter: tableSectionFilter,
    },
    {
      type: TABLE_DATA_TYPE,
      name: 'designer.toolbar.dataTable',
      icon: 'table-data',
      category: 'data',
      capabilities: TABLE_DATA_CAPABILITIES,
      createDefaultNode: createTableDataNode,
      factory: createTableDataExtension,
      propSchemas: tableDataDesignerPropSchemas,
      sectionFilter: tableSectionFilter,
    },
    {
      type: CHART_TYPE,
      name: 'designer.toolbar.chart',
      icon: 'chart',
      category: 'chart',
      capabilities: CHART_CAPABILITIES,
      createDefaultNode: createChartNode,
      factory: createChartExtension,
    },
    {
      type: SVG_TYPE,
      name: 'designer.toolbar.svg',
      icon: 'svg',
      category: 'svg',
      capabilities: SVG_CAPABILITIES,
      createDefaultNode: createSvgNode,
      factory: createSvgExtension,
    },
    {
      type: PAGE_NUMBER_TYPE,
      name: 'designer.toolbar.pageNumber',
      icon: 'page-number',
      category: 'utility',
      capabilities: PAGE_NUMBER_CAPABILITIES,
      createDefaultNode: createPageNumberNode,
      factory: createPageNumberExtension,
    },
  ],
  quickMaterialTypes: [
    LINE_TYPE,
    RECT_TYPE,
    ELLIPSE_TYPE,
    TEXT_TYPE,
    IMAGE_TYPE,
    QRCODE_TYPE,
    BARCODE_TYPE,
  ],
  groupedCatalog: [
    { type: TABLE_STATIC_TYPE, group: 'data' },
    { type: TABLE_DATA_TYPE, group: 'data' },
    { type: CONTAINER_TYPE, group: 'data' },
    { type: CHART_TYPE, group: 'chart' },
    { type: SVG_TYPE, group: 'svg' },
    { type: PAGE_NUMBER_TYPE, group: 'utility' },
  ],
}
