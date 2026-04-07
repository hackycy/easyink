import type { MaterialNode, TableNode, TableSchema } from '@easyink/schema'
import { generateId } from '@easyink/shared'

export const TABLE_DATA_TYPE = 'table-data'

export interface TableDataProps {
  borderWidth: number
  borderColor: string
  borderType: 'solid' | 'dashed' | 'dotted'
  cellPadding: number
  fontSize: number
  color: string
  headerBackground: string
  summaryBackground: string
  stripedRows: boolean
  stripedColor: string
}

export const TABLE_DATA_DEFAULTS: TableDataProps = {
  borderWidth: 1,
  borderColor: '#000000',
  borderType: 'solid',
  cellPadding: 2,
  fontSize: 9,
  color: '#000000',
  headerBackground: '#f0f0f0',
  summaryBackground: '#f9f9f9',
  stripedRows: false,
  stripedColor: '#fafafa',
}

function createDefaultDataTable(): TableSchema {
  const cols = 3
  const rowHeight = 8
  const ratio = 1 / cols

  // 3 rows: header(row 0), data(row 1), summary(row 2)
  return {
    topology: {
      columns: Array.from({ length: cols }, () => ({ ratio })),
      rows: [
        { height: rowHeight, cells: Array.from({ length: cols }, () => ({})) },
        { height: rowHeight, cells: Array.from({ length: cols }, () => ({})) },
        { height: rowHeight, cells: Array.from({ length: cols }, () => ({})) },
      ],
    },
    bands: [
      { kind: 'header', rowRange: { start: 0, end: 1 }, repeatOnEachPage: true },
      { kind: 'data', rowRange: { start: 1, end: 2 } },
      { kind: 'summary', rowRange: { start: 2, end: 3 } },
    ],
    layout: {
      borderAppearance: 'all',
      borderWidth: 1,
      borderType: 'solid',
      borderColor: '#000000',
    },
  }
}

export function createTableDataNode(partial?: Partial<MaterialNode>): MaterialNode {
  const table = createDefaultDataTable()
  const { type: _type, ...rest } = partial || {} as Partial<MaterialNode>
  const node: TableNode = {
    id: generateId('td'),
    x: 0,
    y: 0,
    width: 180,
    height: 24,
    props: { ...TABLE_DATA_DEFAULTS },
    ...rest,
    type: 'table-data',
    table,
  }
  return node
}

export const TABLE_DATA_CAPABILITIES = {
  bindable: true,
  rotatable: false,
  resizable: true,
  supportsChildren: false,
  supportsAnimation: false,
  supportsUnionDrop: false,
  multiBinding: true,
  hasDeepEditing: true,
  hasOverlay: true,
  hasContentEditing: true,
}
