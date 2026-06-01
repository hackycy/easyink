import type { TableBaseProps } from '@easyink/material-table-kernel'
import type { MaterialNode, TableNode } from '@easyink/schema'
import { createDefaultLayout, createDefaultTopology, TABLE_BASE_CAPABILITIES, TABLE_BASE_DEFAULTS } from '@easyink/material-table-kernel'
import { convertUnit, generateId } from '@easyink/shared'

export const TABLE_STATIC_TYPE = 'table-static'

export type TableStaticProps = TableBaseProps

export const TABLE_STATIC_DEFAULTS: TableStaticProps = { ...TABLE_BASE_DEFAULTS }

export function createTableStaticNode(partial?: Partial<MaterialNode>, unit?: string): MaterialNode {
  const c = unit && unit !== 'mm' ? (v: number) => convertUnit(v, 'mm', unit) : (v: number) => v
  const topology = createDefaultTopology(3, 3, c(8))
  const layout = createDefaultLayout()
  const { type: _type, ...rest } = partial || {} as Partial<MaterialNode>
  const node: TableNode = {
    id: generateId('ts'),
    x: 0,
    y: 0,
    width: c(180),
    height: c(24),
    props: {
      ...TABLE_STATIC_DEFAULTS,
      borderWidth: c(TABLE_STATIC_DEFAULTS.borderWidth),
      cellPadding: c(TABLE_STATIC_DEFAULTS.cellPadding),
      typography: {
        ...TABLE_STATIC_DEFAULTS.typography,
        fontSize: c(TABLE_STATIC_DEFAULTS.typography.fontSize),
        letterSpacing: c(TABLE_STATIC_DEFAULTS.typography.letterSpacing),
      },
    },
    ...rest,
    type: 'table-static',
    table: {
      kind: 'static',
      topology,
      layout,
    },
  }
  return node
}

export const TABLE_STATIC_CAPABILITIES = {
  ...TABLE_BASE_CAPABILITIES,
  bindable: true,
  multiBinding: true,
}
