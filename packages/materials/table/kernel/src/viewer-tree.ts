import type { MaterialRenderBudgetToken, ViewerRenderTree } from '@easyink/core'
import type { MaterialNode } from '@easyink/schema'
import type { TableCellSchema, TableRowSchema, TableTopologySchema } from './projection-types'
import type { TableBaseProps } from './types'
import { viewerElement, viewerText } from '@easyink/core'
import { computeRowScaleWithVirtualRows } from './geometry'
import { encodeTableOpaqueIdPartBounded, getTableMaterialModel } from './model'
import { TABLE_BASE_DEFAULTS, TABLE_TYPOGRAPHY_DEFAULTS } from './types'
import { resolveCellTypography } from './typography'

const TABLE_DOM_ID_COMPONENT_MAX_BYTES = 256

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
  renderBudget?: MaterialRenderBudgetToken
}

export function renderTableTree(options: RenderTableTreeOptions): ViewerRenderTree {
  const { node, topology, props, unit } = options
  const model = getTableMaterialModel(node)
  const modelRows = model.bands.flatMap(band => band.rows)
  const rowsById = new Map<string, (typeof modelRows)[number]>(modelRows.map(row => [row.id, row]))
  const scale = computeRowScaleWithVirtualRows(topology.rows, options.elementHeight)
  const spanned = coveredCells(topology)
  reserveTableTree(options, spanned)
  const headerIds = topology.columns.map((_, ci) => {
    const ri = topology.rows.findIndex(row => row.role === 'header')
    if (ri < 0)
      return undefined
    const canonicalRow = canonicalRowAt(ri)
    const canonicalCell = canonicalCellAt(canonicalRow, ci)
    return cellId(node.id, canonicalCell?.id, ri, ci)
  })
  const rows = topology.rows.map((row, ri) => {
    const canonicalRow = canonicalRowAt(ri)
    const sourceRowKey = options.sourceRowKeys?.[ri]
    const instanceKey = sourceRowKey && sourceRowKey !== canonicalRow?.id ? sourceRowKey : undefined
    return viewerElement('tr', {
      attributes: { id: rowId(node.id, sourceRowKey ?? canonicalRow?.id ?? String(ri)) },
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

function reserveTableTree(options: RenderTableTreeOptions, spanned: ReadonlySet<string>): void {
  if (!options.renderBudget)
    return
  const hasHeader = options.topology.rows.some(row => row.role === 'header')
  const hasFooter = options.topology.rows.some(row => row.role === 'footer')
  let elementNodes = 2 + options.topology.rows.length + Number(hasHeader) + Number(hasFooter)
  let textNodes = 0
  const model = getTableMaterialModel(options.node)
  const modelRows = model.bands.flatMap(band => band.rows)
  for (const [rowIndex, row] of options.topology.rows.entries()) {
    const canonicalRowId = options.canonicalRowIds?.[rowIndex]
    const canonicalRow = canonicalRowId
      ? modelRows.find(candidate => candidate.id === canonicalRowId)
      : modelRows[rowIndex]
    for (const [columnIndex] of row.cells.entries()) {
      if (spanned.has(`${rowIndex}:${columnIndex}`))
        continue
      elementNodes++
      const columnId = options.canonicalColumnIds?.[columnIndex]
      const canonicalCell = columnId
        ? canonicalRow?.cells.find(candidate => candidate.columnId === columnId)
        : canonicalRow?.cells[columnIndex]
      if (canonicalCell?.content.kind !== 'materials' || !canonicalCell.content.slotId)
        textNodes++
    }
  }
  options.renderBudget.reserveNodes('element', elementNodes)
  options.renderBudget.reserveNodes('text', textNodes)
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
  const components = [
    'ei-cell',
    encodeDomIdComponent(nodeId),
    encodeDomIdComponent(canonicalId ?? `${rowIndex}:${columnIndex}`),
  ]
  if (instanceKey !== undefined)
    components.push(encodeDomIdComponent(instanceKey))
  return components.join('-')
}

function rowId(nodeId: string, sourceRowKey: string): string {
  return `ei-row-${encodeDomIdComponent(nodeId)}-${encodeDomIdComponent(sourceRowKey)}`
}

function encodeDomIdComponent(value: string): string {
  let opaque: string
  try {
    opaque = encodeTableOpaqueIdPartBounded(value, TABLE_DOM_ID_COMPONENT_MAX_BYTES)
  }
  catch {
    throw new Error('TABLE_VIEWER_DOM_ID_COMPONENT_INVALID')
  }
  const separator = opaque.indexOf(':')
  const byteLength = Number.parseInt(opaque.slice(0, separator), 10)
  const encoded = opaque.slice(separator + 1)
  if (separator < 1 || !Number.isSafeInteger(byteLength) || byteLength < 1)
    throw new Error('TABLE_VIEWER_DOM_ID_COMPONENT_INVALID')
  return encoded
}
