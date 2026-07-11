import type { CompiledMaterialProfile, MaterialNodeCreateInput } from '@easyink/core'
import type { StaticTableModel, TableBaseProps } from '@easyink/material-table-kernel'
import type { MaterialNode } from '@easyink/schema'
import type { UnitType } from '@easyink/shared'
import { createTableModel, TABLE_BASE_CAPABILITIES, TABLE_BASE_DEFAULTS } from '@easyink/material-table-kernel'

export const TABLE_STATIC_TYPE = 'table-static'

export type TableStaticProps = TableBaseProps

export const TABLE_STATIC_DEFAULTS: TableStaticProps = { ...TABLE_BASE_DEFAULTS }

export function createDefaultStaticTableModel(): StaticTableModel {
  return createTableModel({ kind: 'static', columnCount: 3, rowCount: 3 })
}

export function createTableStaticNode(
  profile: CompiledMaterialProfile,
  input?: MaterialNodeCreateInput,
  unit?: UnitType,
): MaterialNode {
  return profile.createNode(TABLE_STATIC_TYPE, input, unit)
}

export const TABLE_STATIC_CAPABILITIES = {
  ...TABLE_BASE_CAPABILITIES,
  bindable: true,
  multiBinding: true,
}
