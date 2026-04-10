import type { TableBaseProps } from '@easyink/material-table-kernel'
import type { MaterialNode, TableNode } from '@easyink/schema'
import { createDefaultLayout, createDefaultTopology, TABLE_BASE_CAPABILITIES, TABLE_BASE_DEFAULTS } from '@easyink/material-table-kernel'
import { generateId } from '@easyink/shared'

export const TABLE_STATIC_TYPE = 'table-static'

export type TableStaticProps = TableBaseProps

export const TABLE_STATIC_DEFAULTS: TableStaticProps = { ...TABLE_BASE_DEFAULTS }

export function createTableStaticNode(partial?: Partial<MaterialNode>): MaterialNode {
  const topology = createDefaultTopology(3, 3, 8)
  const layout = createDefaultLayout()
  const { type: _type, ...rest } = partial || {} as Partial<MaterialNode>
  const node: TableNode = {
    id: generateId('ts'),
    x: 0,
    y: 0,
    width: 180,
    height: 24,
    props: { ...TABLE_STATIC_DEFAULTS },
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
