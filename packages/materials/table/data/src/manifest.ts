import { defineStandardMaterialManifest } from '@easyink/core'
import { tableSchemaAdapter } from '@easyink/material-table-kernel'
import { canonicalizeMaterialNode } from '@easyink/schema'
import { tableDataAIMaterialDescriptor } from './ai'
import { createTableDataExtension } from './designer'
import { tableDataLocaleMessages } from './locale'
import { tableDataDesignerPropSchemas } from './prop-schemas'
import { createDefaultDataTableModel, TABLE_DATA_TYPE } from './schema'
import { measureTableData, renderTableData, tableDataFragmentPaginator } from './viewer'

export const tableDataMaterialManifest = defineStandardMaterialManifest({
  type: TABLE_DATA_TYPE,
  nameKey: 'materials.tableData.name',
  category: 'data',
  iconKey: 'table-data',
  catalogOrder: 30,
  defaultNode: canonicalizeMaterialNode(TABLE_DATA_TYPE, { id: 'table-data-default', width: 180, height: 40, model: createDefaultDataTableModel() }),
  interaction: { rotatable: false, resizable: true, supportsAnimation: false, supportsUnionDrop: true },
  binding: { kind: 'ports', ports: [
    { id: 'records', key: { kind: 'exact', value: 'records' }, role: 'semantic', valueShape: 'record-array', formatEditor: false },
    { id: 'detail-key', key: { kind: 'exact', value: 'detailKey' }, role: 'semantic', valueShape: 'scalar', formatEditor: false },
    { id: 'cell-value', key: { kind: 'prefix', value: 'cell:' }, role: 'display', valueShape: 'scalar', modelPath: '/model/bands', formatEditor: { tabs: ['preset'] } },
  ] },
  layout: { intrinsicSize: 'height', fragmentation: 'break-opportunities', pageRepeat: 'none', overflow: 'clip' },
  structure: { slots: [{ id: 'table-cell-free', key: { kind: 'prefix', value: 'cell:' }, coordinateSpace: 'slot', layoutParticipation: 'owner', reparent: 'allowed' }] },
  properties: tableDataDesignerPropSchemas,
  schemaAdapter: tableSchemaAdapter,
  designerFactory: createTableDataExtension,
  localeMessages: tableDataLocaleMessages,
  viewerExtension: { render: renderTableData, measure: measureTableData, fragmentPaginator: tableDataFragmentPaginator },
  aiDescriptor: tableDataAIMaterialDescriptor,
  requiredModelPaths: ['/columns', '/bands', '/data/collectionPort'],
})
