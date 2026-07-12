import type { ViewerRenderTree } from '@easyink/core'
import type { MaterialNode, TableCellSchema, TableRowSchema, TableTopologySchema } from '@easyink/schema'
import type { TableBaseProps } from './types'
import { viewerElement, viewerText } from '@easyink/core'
import { computeRowScaleWithVirtualRows } from './geometry'
import { getTableMaterialModel } from './model'
import { TABLE_BASE_DEFAULTS, TABLE_TYPOGRAPHY_DEFAULTS } from './types'
import { resolveCellTypography } from './typography'

export interface RenderTableTreeOptions {
  node: MaterialNode<unknown>
  topology: TableTopologySchema
  props: TableBaseProps
  unit: string
  elementHeight: number
  cellText: (cell: TableCellSchema, rowIndex: number, columnIndex: number) => string
  cellBackground?: (rowIndex: number) => string | undefined
  slotOutputs?: Readonly<Record<string, readonly ViewerRenderTree[]>>
  canonicalRowIds?: readonly string[]
  canonicalColumnIds?: readonly string[]
  sourceRowKeys?: readonly string[]
}

export function renderTableTree(options: RenderTableTreeOptions): ViewerRenderTree {
  const { node, topology, props, unit } = options
  const model = getTableMaterialModel(node)
  const modelRows = model.bands.flatMap(band => band.rows)
  const rowsById = new Map<string, (typeof modelRows)[number]>(modelRows.map(row => [row.id, row]))
  const scale = computeRowScaleWithVirtualRows(topology.rows, options.elementHeight)
  const headerIds = topology.columns.map((_, ci) => {
    const ri = topology.rows.findIndex(row => row.role === 'header')
    if (ri < 0)
      return undefined
    const canonicalRow = canonicalRowAt(ri)
    const canonicalCell = canonicalCellAt(canonicalRow, ci)
    return cellId(node.id, canonicalCell?.id, ri, ci)
  })
  const spanned = coveredCells(topology)
  const rows = topology.rows.map((row, ri) => {
    const canonicalRow = canonicalRowAt(ri)
    const sourceRowKey = options.sourceRowKeys?.[ri]
    const instanceKey = sourceRowKey && sourceRowKey !== canonicalRow?.id ? sourceRowKey : undefined
    return viewerElement('tr', {
      attributes: { id: `${node.id}-row-${stableDomToken(sourceRowKey ?? canonicalRow?.id ?? String(ri))}` },
      style: { height: `${row.height * scale}${unit}` },
    }, row.cells.flatMap((cell, ci) => {
      if (spanned.has(`${ri}:${ci}`))
        return []
      const canonical = canonicalCellAt(canonicalRow, ci)
      const id = cellId(node.id, canonical?.id, ri, ci, instanceKey)
      const isHeader = row.role === 'header'
      const tag = isHeader ? 'th' : 'td'
      const colSpan = Math.max(1, cell.colSpan ?? 1)
      const headers = headerIds.slice(ci, ci + colSpan).filter(Boolean).join(' ')
      const typography = resolveCellTypography(cell, props.typography ?? TABLE_TYPOGRAPHY_DEFAULTS)
      const slotId = canonical?.content.kind === 'materials' ? canonical.content.slotId : undefined
      const canonicalSlotOutput = canonical
        ? options.slotOutputs?.[`cell:${canonical.id}`]
        : undefined
      const children = slotId
        ? [...(canonicalSlotOutput ?? options.slotOutputs?.[slotId] ?? [])]
        : [viewerText(options.cellText(cell, ri, ci))]
      return [viewerElement(tag, { attributes: {
        id,
        ...(isHeader ? { scope: 'col' } : headers ? { headers } : {}),
        ...(cell.rowSpan && cell.rowSpan > 1 ? { rowspan: cell.rowSpan } : {}),
        ...(cell.colSpan && cell.colSpan > 1 ? { colspan: cell.colSpan } : {}),
      }, style: {
        'box-sizing': 'border-box',
        'padding': `${props.cellPadding ?? TABLE_BASE_DEFAULTS.cellPadding}${unit}`,
        'border': `${props.borderWidth ?? TABLE_BASE_DEFAULTS.borderWidth}${unit} ${props.borderType || 'solid'} ${props.borderColor || '#000'}`,
        'font-size': `${typography.fontSize}${unit}`,
        'color': typography.color,
        'font-weight': typography.fontWeight,
        'font-style': typography.fontStyle,
        'line-height': typography.lineHeight,
        'letter-spacing': `${typography.letterSpacing}${unit}`,
        'text-align': typography.textAlign,
        'vertical-align': typography.verticalAlign,
        ...(options.cellBackground?.(ri) ? { background: options.cellBackground(ri)! } : {}),
      } }, children)]
    }))
  })

  const head = rowsByRole(rows, topology.rows, row => row.role === 'header')
  const foot = rowsByRole(rows, topology.rows, row => row.role === 'footer')
  const body = rowsByRole(rows, topology.rows, row => row.role !== 'header' && row.role !== 'footer')
  return viewerElement('table', { attributes: {
    ...(model.accessibility?.caption ? { 'aria-label': model.accessibility.caption } : {}),
    ...(model.accessibility?.description ? { 'aria-description': model.accessibility.description } : {}),
  }, style: {
    'width': '100%',
    'height': '100%',
    'border-collapse': 'collapse',
    'border-spacing': '0',
    'table-layout': 'fixed',
    'box-sizing': 'border-box',
    ...(props.typography?.fontFamily ? { 'font-family': props.typography.fontFamily } : {}),
  } }, [
    ...(head.length ? [viewerElement('thead', {}, head)] : []),
    viewerElement('tbody', {}, body),
    ...(foot.length ? [viewerElement('tfoot', {}, foot)] : []),
  ])

  function canonicalRowAt(rowIndex: number) {
    const rowId = options.canonicalRowIds?.[rowIndex]
    return rowId ? rowsById.get(rowId) : modelRows[rowIndex]
  }

  function canonicalCellAt(canonicalRow: (typeof modelRows)[number] | undefined, columnIndex: number) {
    const columnId = options.canonicalColumnIds?.[columnIndex]
    return columnId
      ? canonicalRow?.cells.find(cell => cell.columnId === columnId)
      : canonicalRow?.cells[columnIndex]
  }
}

function rowsByRole(
  trees: readonly ViewerRenderTree[],
  rows: readonly TableRowSchema[],
  include: (row: TableRowSchema) => boolean,
): ViewerRenderTree[] {
  return trees.filter((_, index) => include(rows[index]!))
}

function coveredCells(topology: TableTopologySchema): Set<string> {
  const covered = new Set<string>()
  topology.rows.forEach((row, ri) => row.cells.forEach((cell, ci) => {
    for (let dr = 0; dr < (cell.rowSpan ?? 1); dr++) {
      for (let dc = 0; dc < (cell.colSpan ?? 1); dc++) {
        if (dr || dc)
          covered.add(`${ri + dr}:${ci + dc}`)
      }
    }
  }))
  return covered
}

function cellId(nodeId: string, canonicalId: string | undefined, rowIndex: number, columnIndex: number, instanceKey?: string): string {
  const base = `${nodeId}-cell-${canonicalId || `${rowIndex}-${columnIndex}`}`
  return instanceKey ? `${base}--${stableDomToken(instanceKey)}` : base
}

function stableDomToken(value: string): string {
  return value.replace(/[^\w.-]/g, '_')
}
