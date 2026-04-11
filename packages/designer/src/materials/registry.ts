import type { DesignerStore } from '../store/designer-store'
import type { MaterialCapabilities, MaterialCatalogEntry, MaterialDefinition, MaterialExtensionFactory, PanelSectionId } from '../types'

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
  createRelationExtension,
  createRelationNode,
  RELATION_CAPABILITIES,
  RELATION_TYPE,
} from '@easyink/material-relation'
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
import { getPropSchemas } from './prop-schemas'

// ─── Material definitions ────────────────────────────────────────────

interface MaterialEntry {
  type: string
  name: string
  icon: string
  category: MaterialDefinition['category']
  capabilities: MaterialCapabilities
  createDefaultNode: MaterialDefinition['createDefaultNode']
  factory: MaterialExtensionFactory
  sectionFilter?: MaterialDefinition['sectionFilter']
}

/**
 * Table materials hide element-level BindingSection.
 * Cell-level binding is shown via PropertyPanelOverlay during deep editing.
 */
function tableSectionFilter(sectionId: PanelSectionId): boolean {
  if (sectionId === 'binding')
    return false
  return true
}

const MATERIALS: MaterialEntry[] = [
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
    type: RELATION_TYPE,
    name: 'designer.toolbar.relation',
    icon: 'relation',
    category: 'relation',
    capabilities: RELATION_CAPABILITIES,
    createDefaultNode: createRelationNode,
    factory: createRelationExtension,
  },
]

// ─── Catalog entries ─────────────────────────────────────────────────

// Architecture 10.2: quick materials = line, rect, ellipse, text, image, qrcode, barcode
const QUICK_MATERIAL_TYPES = [
  LINE_TYPE,
  RECT_TYPE,
  ELLIPSE_TYPE,
  TEXT_TYPE,
  IMAGE_TYPE,
  QRCODE_TYPE,
  BARCODE_TYPE,
]

// Grouped catalog: data / chart / svg / relation
const GROUPED_CATALOG: Array<{ type: string, group: MaterialCatalogEntry['group'] }> = [
  { type: TABLE_STATIC_TYPE, group: 'data' },
  { type: TABLE_DATA_TYPE, group: 'data' },
  { type: CONTAINER_TYPE, group: 'data' },
  { type: CHART_TYPE, group: 'chart' },
  { type: SVG_TYPE, group: 'svg' },
  { type: RELATION_TYPE, group: 'relation' },
]

// ─── Registration function ───────────────────────────────────────────

/**
 * Registers all built-in materials, designer extensions, and catalog entries
 * on the given DesignerStore.
 *
 * Architecture ref: 11.1 (MaterialDefinition), 11.2 (catalog hierarchy),
 *                   10.2 (quick + grouped material bar)
 */
export function registerBuiltinMaterials(store: DesignerStore): void {
  for (const entry of MATERIALS) {
    const definition: MaterialDefinition = {
      type: entry.type,
      name: entry.name,
      icon: entry.icon,
      category: entry.category,
      capabilities: entry.capabilities,
      props: getPropSchemas(entry.type),
      createDefaultNode: entry.createDefaultNode,
      sectionFilter: entry.sectionFilter,
    }

    store.registerMaterial(definition)
    store.registerDesignerFactory(entry.type, entry.factory)
  }

  // Register quick material catalog entries
  for (const type of QUICK_MATERIAL_TYPES) {
    const def = store.getMaterial(type)
    if (!def)
      continue
    store.registerCatalogEntry({
      id: `quick-${type}`,
      group: 'quick',
      label: def.name,
      icon: def.icon,
      materialType: type,
      priority: 'quick',
    })
  }

  // Register grouped material catalog entries
  for (const { type, group } of GROUPED_CATALOG) {
    const def = store.getMaterial(type)
    if (!def)
      continue
    store.registerCatalogEntry({
      id: `grouped-${type}`,
      group,
      label: def.name,
      icon: def.icon,
      materialType: type,
      priority: 'grouped',
    })
  }
}
