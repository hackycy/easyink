import type { CompiledMaterialProfile, MaterialNodeCreateInput } from '@easyink/core'
import type { DataTableModel, TableBaseProps } from '@easyink/material-table-kernel'
import type { MaterialNode } from '@easyink/schema'
import type { UnitType } from '@easyink/shared'
import {
  allocateTableIdentity,
  assertValidTableModel,
  createSequentialTableIdentityAllocator,
  createTableModel,
  TABLE_BASE_CAPABILITIES,
  TABLE_BASE_DEFAULTS,
} from '@easyink/material-table-kernel'
import { assertJsonValue } from '@easyink/shared'

export const TABLE_DATA_TYPE = 'table-data'

export interface TableDataProps extends TableBaseProps {
  headerBackground: string
  summaryBackground: string
  stripedRows: boolean
  stripedColor: string
}

export const TABLE_DATA_DEFAULTS: TableDataProps = {
  ...TABLE_BASE_DEFAULTS,
  headerBackground: '',
  summaryBackground: '',
  stripedRows: false,
  stripedColor: '#fafafa',
}

export function createDefaultDataTableModel(): DataTableModel {
  const allocator = createSequentialTableIdentityAllocator('table-data-default')
  const source = createTableModel({ kind: 'static', columnCount: 3, rowCount: 3 }, allocator)
  const occupied = new Set<string>([
    ...source.columns.map(column => column.id),
    ...source.bands.map(band => band.id),
    ...source.bands.flatMap(band => band.rows.flatMap(row => [row.id, ...row.cells.map(cell => cell.id)])),
  ])
  const rows = source.bands[0]!.rows
  const model: DataTableModel = {
    kind: 'data',
    columns: source.columns,
    bands: [
      { id: source.bands[0]!.id, role: 'header', rows: [rows[0]!] },
      { id: allocateTableIdentity(allocator, 'band', occupied), role: 'detail', rows: [rows[1]!] },
      { id: allocateTableIdentity(allocator, 'band', occupied), role: 'footer', rows: [rows[2]!] },
    ],
    merges: [],
    style: {},
    data: { collectionPort: 'records' },
  }
  assertValidTableModel(model)
  assertJsonValue(model)
  return model
}

export function createTableDataNode(
  profile: CompiledMaterialProfile,
  input?: MaterialNodeCreateInput,
  unit?: UnitType,
): MaterialNode {
  return profile.createNode(TABLE_DATA_TYPE, input, unit)
}

export const TABLE_DATA_CAPABILITIES = {
  ...TABLE_BASE_CAPABILITIES,
  bindable: true,
  multiBinding: true,
}
