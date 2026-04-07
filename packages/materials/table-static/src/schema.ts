import type { MaterialNode, TableNode, TableSchema } from '@easyink/schema'
import { generateId } from '@easyink/shared'

export const TABLE_STATIC_TYPE = 'table-static'

export interface TableStaticProps {
  borderWidth: number
  borderColor: string
  borderType: 'solid' | 'dashed' | 'dotted'
  cellPadding: number
  fontSize: number
  color: string
}

export const TABLE_STATIC_DEFAULTS: TableStaticProps = {
  borderWidth: 1,
  borderColor: '#000000',
  borderType: 'solid',
  cellPadding: 2,
  fontSize: 9,
  color: '#000000',
}

function createDefaultTable(): TableSchema {
  const cols = 3
  const rowCount = 3
  const rowHeight = 8
  const ratio = 1 / cols

  return {
    topology: {
      columns: Array.from({ length: cols }, () => ({ ratio })),
      rows: Array.from({ length: rowCount }, () => ({
        height: rowHeight,
        cells: Array.from({ length: cols }, () => ({})),
      })),
    },
    bands: [
      {
        kind: 'body',
        rowRange: { start: 0, end: rowCount },
      },
    ],
    layout: {
      borderAppearance: 'all',
      borderWidth: 1,
      borderType: 'solid',
      borderColor: '#000000',
    },
  }
}

export function createTableStaticNode(partial?: Partial<MaterialNode>): MaterialNode {
  const table = createDefaultTable()
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
    table,
  }
  return node
}

export const TABLE_STATIC_CAPABILITIES = {
  bindable: false,
  rotatable: false,
  resizable: true,
  supportsChildren: false,
  supportsAnimation: false,
  supportsUnionDrop: false,
  multiBinding: false,
  hasDeepEditing: true,
  hasOverlay: true,
  hasContentEditing: true,
}
