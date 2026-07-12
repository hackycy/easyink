import { defineStandardMaterialManifest } from '@easyink/core'
import { tableSchemaAdapter } from '@easyink/material-table-kernel'
import { canonicalizeMaterialNode } from '@easyink/schema'
import { tableStaticAIMaterialDescriptor } from './ai'
import { createTableStaticExtension } from './designer'
import { tableStaticLocaleMessages } from './locale'
import { tableStaticDesignerPropSchemas } from './prop-schemas'
import { createDefaultStaticTableModel, TABLE_STATIC_TYPE } from './schema'
import { renderTableStatic } from './viewer'

export const tableStaticMaterialManifest = defineStandardMaterialManifest({
  type: TABLE_STATIC_TYPE,
  nameKey: 'materials.tableStatic.name',
  category: 'data',
  iconKey: 'table',
  catalogOrder: 20,
  defaultNode: canonicalizeMaterialNode(TABLE_STATIC_TYPE, { id: 'table-static-default', width: 180, height: 24, model: createDefaultStaticTableModel() }),
  interaction: { rotatable: false, resizable: true, supportsAnimation: false, supportsUnionDrop: true },
  binding: { kind: 'ports', ports: [{ id: 'cell-value', key: { kind: 'prefix', value: 'cell:' }, role: 'display', valueShape: 'scalar', modelPath: '/model/bands', formatEditor: { tabs: ['preset'] } }] },
  layout: { intrinsicSize: 'height', fragmentation: 'none', pageRepeat: 'none', overflow: 'clip' },
  structure: { slots: [{ id: 'table-cell-free', key: { kind: 'prefix', value: 'cell:' }, coordinateSpace: 'slot', layoutParticipation: 'owner', reparent: 'allowed' }] },
  properties: tableStaticDesignerPropSchemas,
  schemaAdapter: tableSchemaAdapter,
  designerFactory: createTableStaticExtension,
  localeMessages: tableStaticLocaleMessages,
  viewerExtension: { render: renderTableStatic },
  aiDescriptor: tableStaticAIMaterialDescriptor,
  generation: { enabled: true, modelSchema: 'infer-from-default', bindingShape: 'infer-from-binding', examples: 'default-model', requiredModelPaths: ['/columns', '/bands'] },
})
