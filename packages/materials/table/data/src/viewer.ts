import type { MaterialFragmentAdapter, MaterialMeasureRequest, MaterialViewerLayoutFacet, ViewerMeasureContext, ViewerMeasureResult, ViewerRenderContext, ViewerRenderOutput } from '@easyink/core'
import type { TableCellSchema, TableRowSchema } from '@easyink/material-table-kernel'
import type { BindingRef, MaterialNode } from '@easyink/schema'
import type { JsonValue } from '@easyink/shared'
import type { TableDataProps } from './schema'
import { createLayoutConstraintKey, formatBindingDisplayValue, freezeMaterialLayoutPlan, resolveBindingValue, resolveFieldFromRecord, viewerElement, viewerText } from '@easyink/core'
import { computeAutoRowHeights, computeRowScaleWithVirtualRows, getTableMaterialModel, projectTableTopology, renderTableTree, resolveTableBaseProps } from '@easyink/material-table-kernel'
import { TABLE_DATA_PLACEHOLDER_ROW_COUNT } from './layout'
import { TABLE_DATA_DEFAULTS } from './schema'

/**
 * Filter rows to only include visible ones based on showHeader/showFooter settings.
 */
interface RuntimeTableRow {
  row: TableRowSchema
  canonicalRowId: string
  sourceRowKey: string
}

function filterVisibleRows(rows: RuntimeTableRow[], showHeader: boolean, showFooter: boolean): RuntimeTableRow[] {
  return rows.filter(({ row }) => {
    if (row.role === 'header' && !showHeader)
      return false
    if (row.role === 'footer' && !showFooter)
      return false
    return true
  })
}

/**
 * Cache resolved runtime layout per table-data schema instance, keyed by
 * `node.model` (object identity). Render needs the same per-row heights
 * the measure pass produced, but ViewerRuntime overwrites `node.height`
 * after measure — so re-deriving the baseline scale from the post-measure
 * `node.height` would multiply the heights again. The runtime preserves
 * `node.model` by reference across the spread, so this WeakMap survives
 * the measure→render hop with zero schema mutation.
 */
interface ResolvedRuntimeLayout {
  rows: TableRowSchema[]
  rowSources: Array<{ canonicalRowId: string, sourceRowKey: string }>
  columnIds: string[]
  rowHeights: number[]
  totalHeight: number
}

const runtimeLayoutCache = new WeakMap<object, ResolvedRuntimeLayout>()

/**
 * Resolve the visible row sequence + per-row heights for a data table
 * under the runtime data context. This is the table-data viewer's
 * independent source of truth: it expands repeat-template rows, hides
 * header/footer when configured, then runs the kernel's auto-row-height
 * pass so wrapping text gets the vertical space it needs.
 *
 * `declaredElementHeight` MUST be the original schema element height
 * (pre-measure), so that the designer-applied row scale survives.
 *
 * Architecture ref: 07-layout-engine.md §7.3
 */
function resolveRuntimeLayout(
  node: MaterialNode<unknown>,
  data: Record<string, unknown>,
  declaredElementHeight: number,
  reportDiagnostic?: ViewerRenderContext['reportDiagnostic'],
): ResolvedRuntimeLayout {
  const projection = projectTableTopology(node)
  const { topology } = projection
  const expandedRows = expandRepeatTemplateRows(topology.rows, projection.rowIds, node, data, reportDiagnostic)
  const visibleRows = filterVisibleRows(expandedRows, true, true)

  const repeatRow = topology.rows.find(row => row.role === 'repeat-template')
  const baselineScale = computeRowScaleWithVirtualRows(
    topology.rows,
    declaredElementHeight,
    undefined,
    repeatRow ? { rowHeight: repeatRow.height, count: TABLE_DATA_PLACEHOLDER_ROW_COUNT } : undefined,
  )
  const baselineHeights = visibleRows.map(({ row }) => row.height * baselineScale)

  const props: TableDataProps = { ...TABLE_DATA_DEFAULTS, ...resolveTableBaseProps(node) }
  const rowHeights = computeAutoRowHeights({
    topology: { columns: topology.columns, rows: visibleRows.map(item => item.row) },
    elementWidth: node.width,
    baselineHeights,
    props,
  })
  let totalHeight = 0
  for (const h of rowHeights)
    totalHeight += h

  return {
    rows: visibleRows.map(item => item.row),
    rowSources: visibleRows.map(({ canonicalRowId, sourceRowKey }) => ({ canonicalRowId, sourceRowKey })),
    columnIds: [...projection.columnIds],
    rowHeights,
    totalHeight,
  }
}

/**
 * Measure the table-data element's expanded dimensions after data binding.
 * Called by ViewerRuntime before page planning to adjust the element height.
 * Owns the runtime auto-row-height calculation independently from the
 * designer's static layout.
 * Architecture ref: 07-layout-engine.md §7.3
 */
export function measureTableData(node: MaterialNode<unknown>, context: ViewerMeasureContext): ViewerMeasureResult {
  if (node.type !== 'table-data') {
    return { width: node.width, height: node.height }
  }
  const data = context.data ?? {}
  const tableNode = node
  const layout = resolveRuntimeLayout(tableNode, data, node.height, context.reportDiagnostic)
  // Cache so render() reuses the exact same per-row heights without
  // re-deriving baseline scale from the (about to be overwritten) node.height.
  runtimeLayoutCache.set(runtimeLayoutKey(tableNode), layout)
  const facts = createTableLayoutFacts(layout)
  return {
    width: node.width,
    height: layout.totalHeight,
    breakOpportunities: facts.breakOpportunities,
    payload: facts.payload,
  }
}

export const tableDataFragmentAdapter: MaterialFragmentAdapter = {
  createFragment(request) {
    const index = readTableLayoutIndex(request.plan.payload)
    const indexedRows = index
      ? selectTableLayoutRows(index, request.startBlockOffset, request.endBlockOffset)
      : undefined
    const rows = indexedRows ?? readTableLayoutRows(request.plan.payload)
    const renderPayload: JsonValue = rows
      ? {
          kind: 'table-data-fragment',
          startBlockOffset: request.startBlockOffset,
          endBlockOffset: request.endBlockOffset,
          rows: rows.filter(row => (
            row.startBlockOffset >= request.startBlockOffset
            && row.endBlockOffset <= request.endBlockOffset
          )),
        }
      : {
          startBlockOffset: request.startBlockOffset,
          endBlockOffset: request.endBlockOffset,
        }
    return {
      inlineSize: request.plan.borderBox.width,
      blockSize: request.endBlockOffset - request.startBlockOffset,
      consumedRange: {
        startBlockOffset: request.startBlockOffset,
        endBlockOffset: request.endBlockOffset,
      },
      renderPayload,
      diagnostics: [],
    }
  },
}

export const tableDataViewerLayout: MaterialViewerLayoutFacet = Object.freeze({
  async measure(request: MaterialMeasureRequest) {
    const node = { ...request.node, model: request.resolvedModel } as MaterialNode<unknown>
    const data = request.mode === 'authoritative'
      ? await createMeasureDataSnapshot(request, node)
      : {}
    const layout = resolveRuntimeLayout(node, data, request.node.height)
    request.budget.reserveRuntimeRows(layout.rows.length)
    request.budget.reserveLayoutFacts('row', layout.rows.length)
    const facts = createTableLayoutFacts(layout)
    const borderBox = {
      x: request.node.x,
      y: request.node.y,
      width: request.node.width,
      height: layout.totalHeight,
    }
    return freezeMaterialLayoutPlan({
      instanceKey: request.instanceKey,
      nodeId: request.node.id,
      nodeRevision: request.nodeRevision,
      constraintKey: createLayoutConstraintKey(request.constraints),
      borderBox,
      contentBox: borderBox,
      slotBoxes: [],
      breakOpportunities: facts.breakOpportunities,
      diagnostics: [],
      payload: facts.payload,
    })
  },
  fragment: tableDataFragmentAdapter,
})

export function renderTableData(node: MaterialNode<unknown>, context?: ViewerRenderContext): ViewerRenderOutput {
  if (node.type !== 'table-data') {
    return {
      tree: viewerElement('div', { style: { 'width': '100%', 'height': '100%', 'display': 'flex', 'align-items': 'center', 'justify-content': 'center', 'background': '#f9f9f9', 'color': '#999', 'font-size': '12px' } }, [viewerText('[Data Table]')]),
    }
  }

  const props: TableDataProps = { ...TABLE_DATA_DEFAULTS, ...resolveTableBaseProps(node) }
  const data = context?.data ?? {}
  const tableNode = node

  // Prefer the layout produced by measure() — `node.height` has been
  // overwritten by ViewerRuntime, so we cannot recompute baseline scale
  // from it here. Fall back to a direct compute when render is called
  // without a prior measure (e.g. unit tests).
  const cached = runtimeLayoutCache.get(runtimeLayoutKey(tableNode))
  const { rows: runtimeRows, rowSources: runtimeRowSources, columnIds, rowHeights: runtimeRowHeights, totalHeight } = cached
    ?? resolveRuntimeLayout(tableNode, data, node.height, context?.reportDiagnostic)

  const fragmentRows = readTableFragmentRows(context?.fragmentPlan.renderPayload)
  const selectedIndices = fragmentRows?.map(row => row.rowIndex)
    ?? runtimeRows.map((_, index) => index)
  const visibleRows = selectedIndices.flatMap(index => runtimeRows[index] ? [runtimeRows[index]!] : [])
  const rowSources = selectedIndices.flatMap(index => runtimeRowSources[index] ? [runtimeRowSources[index]!] : [])
  const rowHeights = selectedIndices.flatMap(index => runtimeRowHeights[index] === undefined ? [] : [runtimeRowHeights[index]!])

  const sizedRows: TableRowSchema[] = visibleRows.map((row, i) => ({
    ...row,
    height: rowHeights[i] ?? row.height,
  }))

  const tree = renderTableTree({
    node,
    topology: { columns: projectTableTopology(node).topology.columns, rows: sizedRows },
    props,
    unit: context?.unit ?? 'mm',
    elementHeight: fragmentRows ? context!.fragmentPlan.box.height : totalHeight,
    slotOutputs: context?.slotOutputs,
    canonicalRowIds: rowSources.map(source => source.canonicalRowId),
    canonicalColumnIds: columnIds,
    sourceRowKeys: rowSources.map(source => source.sourceRowKey),
    cellText: cell => cell.content?.text || '',
    cellBackground: (ri) => {
      const row = sizedRows[ri]
      if (!row)
        return undefined
      const modelRole = row.role === 'repeat-template' ? 'detail' : row.role === 'normal' ? 'body' : row.role
      return getTableMaterialModel(node).bands.find(band => band.role === modelRole)?.style?.background
    },
  })
  return { tree }
}

/**
 * Expand repeat-template rows into N data rows by resolving collection bindings.
 * Header/footer rows resolve staticBinding to produce content text.
 */
function expandRepeatTemplateRows(
  rows: TableRowSchema[],
  rowIds: readonly string[],
  node: MaterialNode<unknown>,
  data: Record<string, unknown>,
  reportDiagnostic?: ViewerRenderContext['reportDiagnostic'],
): RuntimeTableRow[] {
  const result: RuntimeTableRow[] = []
  const model = getTableMaterialModel(node)
  const collectionBinding = model.kind === 'data' ? bindingAt(node, model.data.collectionPort) : undefined
  const collectionData = collectionBinding ? resolveBindingValue(collectionBinding, data) : undefined
  const records = Array.isArray(collectionData) ? collectionData : undefined
  const detailKeyBinding = model.kind === 'data' && model.data.detailKeyPort
    ? bindingAt(node, model.data.detailKeyPort)
    : undefined
  const recordIdentities = records && collectionBinding
    ? resolveRecordIdentities(records, collectionBinding, detailKeyBinding, node.id, reportDiagnostic)
    : []

  for (const [rowIndex, row] of rows.entries()) {
    const canonicalRowId = rowIds[rowIndex] ?? `row-${rowIndex}`
    if (row.role !== 'repeat-template') {
      // Header/footer/normal: resolve staticBinding into content
      result.push({ row: resolveStaticRow(row, data, node.id, reportDiagnostic), canonicalRowId, sourceRowKey: canonicalRowId })
      continue
    }

    // The configured collection port owns detail repetition, even for hosted-only rows.
    if (!records || !collectionBinding || records.length === 0) {
      // Keep one template row as an empty-state placeholder.
      result.push({ row, canonicalRowId, sourceRowKey: canonicalRowId })
      continue
    }

    // Expand: one row per collection item
    for (const [recordIndex, item] of records.entries()) {
      const record = (typeof item === 'object' && item !== null ? item : {}) as Record<string, unknown>
      const expandedCells: TableCellSchema[] = row.cells.map((cell) => {
        if (!cell.binding?.fieldPath)
          return { ...cell }
        const leafField = relativeRecordPath(cell.binding.fieldPath, collectionBinding.fieldPath)
        const value = resolveFieldFromRecord(leafField, record)
        const formatted = formatCellValue(value, cell.binding, data, node.id, reportDiagnostic)
        return {
          ...cell,
          content: { text: formatted },
        }
      })
      result.push({
        row: { height: row.height, role: 'repeat-template', cells: expandedCells },
        canonicalRowId,
        sourceRowKey: `${canonicalRowId}:${recordIdentities[recordIndex] ?? `record-${recordIndex}`}`,
      })
    }
  }

  return result
}

function bindingAt(node: MaterialNode<unknown>, port: string): BindingRef | undefined {
  const binding = node.bindings[port]
  return binding && !Array.isArray(binding) ? binding as BindingRef : undefined
}

async function createMeasureDataSnapshot(
  request: MaterialMeasureRequest,
  node: MaterialNode<unknown>,
): Promise<Record<string, unknown>> {
  const data: Record<string, unknown> = {}
  const model = getTableMaterialModel(node)
  const collectionPort = model.kind === 'data' ? model.data.collectionPort : undefined
  const collectionBinding = collectionPort ? bindingAt(node, collectionPort) : undefined
  let records: readonly Readonly<Record<string, unknown>>[] = []

  if (collectionPort && collectionBinding) {
    const opened = await request.openCollection(collectionPort, request.scope, request.signal)
    if (opened.status === 'opened') {
      const collected: Readonly<Record<string, unknown>>[] = []
      try {
        let done = false
        while (!done) {
          const chunk = await opened.cursor.readNext(256, request.signal)
          collected.push(...chunk.records)
          done = chunk.done
        }
      }
      finally {
        await opened.cursor.close()
      }
      records = collected
    }
    setDataPath(data, collectionBinding.fieldPath, records)
  }

  for (const [port, candidate] of Object.entries(node.bindings)) {
    if (port === collectionPort || !candidate || Array.isArray(candidate) || 'kind' in candidate)
      continue
    const binding = candidate as BindingRef
    if (collectionBinding && binding.fieldPath.startsWith(`${collectionBinding.fieldPath}/`))
      continue
    const resolved = request.resolveBinding(port, request.scope)
    if (resolved.status === 'resolved')
      setDataPath(data, binding.fieldPath, resolved.value)
  }
  return data
}

function setDataPath(root: Record<string, unknown>, path: string, value: unknown): void {
  const segments = path.split('/').filter(Boolean)
  if (segments.length === 0 || segments.some(segment => ['__proto__', 'prototype', 'constructor'].includes(segment)))
    return
  let current = root
  for (const segment of segments.slice(0, -1)) {
    const child = current[segment]
    if (typeof child === 'object' && child !== null && !Array.isArray(child)) {
      current = child as Record<string, unknown>
    }
    else {
      const next: Record<string, unknown> = {}
      current[segment] = next
      current = next
    }
  }
  current[segments.at(-1)!] = value
}

function tableBandRole(row: TableRowSchema): string {
  if (row.role === 'repeat-template')
    return 'detail'
  if (row.role === 'normal')
    return 'body'
  return row.role
}

function createTableLayoutFacts(layout: ResolvedRuntimeLayout) {
  let blockOffset = 0
  const rows = layout.rows.map((row, rowIndex) => {
    const startBlockOffset = blockOffset
    blockOffset += layout.rowHeights[rowIndex] ?? row.height
    const source = layout.rowSources[rowIndex]!
    return {
      rowIndex,
      canonicalRowId: source.canonicalRowId,
      sourceRowKey: source.sourceRowKey,
      bandRole: tableBandRole(row),
      startBlockOffset,
      endBlockOffset: blockOffset,
    }
  })
  return {
    breakOpportunities: rows.slice(0, -1).map(row => ({
      id: `table-row:${row.rowIndex}:${row.sourceRowKey}`,
      blockOffset: row.endBlockOffset,
      penalty: 0,
    })),
    payload: {
      kind: 'table-data-layout' as const,
      columnIds: layout.columnIds,
      rowStartOffsets: rows.map(row => row.startBlockOffset),
      rowEndOffsets: rows.map(row => row.endBlockOffset),
      rows,
    },
  }
}

interface TableLayoutRowFact extends Record<string, string | number> {
  rowIndex: number
  canonicalRowId: string
  sourceRowKey: string
  bandRole: string
  startBlockOffset: number
  endBlockOffset: number
}

interface TableLayoutRangeIndex {
  readonly rows: readonly unknown[]
  readonly rowStartOffsets: readonly unknown[]
  readonly rowEndOffsets: readonly unknown[]
}

function readTableLayoutIndex(payload: unknown): TableLayoutRangeIndex | undefined {
  if (!isRecord(payload)
    || payload.kind !== 'table-data-layout'
    || !Array.isArray(payload.rows)
    || !Array.isArray(payload.rowStartOffsets)
    || !Array.isArray(payload.rowEndOffsets)
    || payload.rows.length !== payload.rowStartOffsets.length
    || payload.rows.length !== payload.rowEndOffsets.length) {
    return undefined
  }
  return {
    rows: payload.rows,
    rowStartOffsets: payload.rowStartOffsets,
    rowEndOffsets: payload.rowEndOffsets,
  }
}

function selectTableLayoutRows(
  index: TableLayoutRangeIndex,
  startBlockOffset: number,
  endBlockOffset: number,
): TableLayoutRowFact[] {
  if (!Number.isFinite(startBlockOffset) || !Number.isFinite(endBlockOffset) || endBlockOffset < startBlockOffset)
    throw new Error('TABLE_FRAGMENT_RANGE_BOUNDARY_INVALID')

  const startIndex = lowerBoundOffset(index.rowStartOffsets, startBlockOffset)
  const endIndex = lowerBoundOffset(index.rowEndOffsets, endBlockOffset)
  const exactStart = readOffset(index.rowStartOffsets, startIndex) === startBlockOffset
  const exactEnd = readOffset(index.rowEndOffsets, endIndex) === endBlockOffset

  if (startBlockOffset === endBlockOffset) {
    const isOuterStart = startBlockOffset === 0 && startIndex === 0
    if (!isOuterStart && !exactStart && !exactEnd)
      throw new Error('TABLE_FRAGMENT_RANGE_BOUNDARY_INVALID')
    return []
  }
  if (!exactStart || !exactEnd || endIndex < startIndex)
    throw new Error('TABLE_FRAGMENT_RANGE_BOUNDARY_INVALID')
  return index.rows.slice(startIndex, endIndex + 1) as TableLayoutRowFact[]
}

function lowerBoundOffset(offsets: readonly unknown[], target: number): number {
  let low = 0
  let high = offsets.length
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2)
    const value = readOffset(offsets, middle)
    if (value === undefined)
      throw new Error('TABLE_LAYOUT_RANGE_INDEX_INVALID')
    if (value < target)
      low = middle + 1
    else
      high = middle
  }
  return low
}

function readOffset(offsets: readonly unknown[], index: number): number | undefined {
  if (index >= offsets.length)
    return undefined
  const value = offsets[index]
  if (typeof value !== 'number' || !Number.isFinite(value))
    throw new Error('TABLE_LAYOUT_RANGE_INDEX_INVALID')
  return value
}

function readTableLayoutRows(payload: unknown): TableLayoutRowFact[] | undefined {
  if (!isRecord(payload) || payload.kind !== 'table-data-layout' || !Array.isArray(payload.rows))
    return undefined
  const rows: TableLayoutRowFact[] = []
  for (const candidate of payload.rows) {
    if (!isRecord(candidate)
      || !Number.isSafeInteger(candidate.rowIndex)
      || typeof candidate.canonicalRowId !== 'string'
      || typeof candidate.sourceRowKey !== 'string'
      || typeof candidate.bandRole !== 'string'
      || typeof candidate.startBlockOffset !== 'number'
      || typeof candidate.endBlockOffset !== 'number') {
      return undefined
    }
    rows.push(candidate as unknown as TableLayoutRowFact)
  }
  return rows
}

function readTableFragmentRows(payload: unknown): TableLayoutRowFact[] | undefined {
  if (!isRecord(payload) || payload.kind !== 'table-data-fragment' || !Array.isArray(payload.rows))
    return undefined
  return readTableLayoutRows({ kind: 'table-data-layout', rows: payload.rows })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function relativeRecordPath(fieldPath: string, collectionPath: string): string {
  const prefix = `${collectionPath}/`
  return fieldPath.startsWith(prefix) ? fieldPath.slice(prefix.length) : fieldPath
}

function resolveRecordIdentities(
  records: readonly unknown[],
  collectionBinding: BindingRef,
  detailKeyBinding: BindingRef | undefined,
  nodeId: string,
  reportDiagnostic?: ViewerRenderContext['reportDiagnostic'],
): string[] {
  if (!detailKeyBinding)
    return records.map((_, index) => `record-${index}`)
  const keyPath = relativeRecordPath(detailKeyBinding.fieldPath, collectionBinding.fieldPath)
  const keys = records.map((record) => {
    const value = typeof record === 'object' && record !== null
      ? resolveFieldFromRecord(keyPath, record as Record<string, unknown>)
      : undefined
    return stableRecordKey(value)
  })
  const counts = new Map<string, number>()
  const tokenValues = new Map<string, Set<string>>()
  for (const key of keys) {
    if (key) {
      counts.set(key.raw, (counts.get(key.raw) ?? 0) + 1)
      const values = tokenValues.get(key.token) ?? new Set<string>()
      values.add(key.raw)
      tokenValues.set(key.token, values)
    }
  }
  return keys.map((key, index) => {
    if (!key) {
      reportDiagnostic?.({
        code: 'TABLE_DATA_DETAIL_KEY_MISSING',
        severity: 'warning',
        message: `Table ${nodeId} record ${index} has no usable detail key.`,
        nodeId,
      })
      return `record-${index}`
    }
    if ((counts.get(key.raw) ?? 0) > 1) {
      reportDiagnostic?.({
        code: 'TABLE_DATA_DETAIL_KEY_DUPLICATE',
        severity: 'warning',
        message: `Table ${nodeId} record ${index} has a duplicate detail key.`,
        nodeId,
      })
      return `record-${index}`
    }
    if ((tokenValues.get(key.token)?.size ?? 0) > 1) {
      reportDiagnostic?.({
        code: 'TABLE_DATA_DETAIL_KEY_COLLISION',
        severity: 'warning',
        message: `Table ${nodeId} record ${index} has a colliding detail key token.`,
        nodeId,
      })
      return `record-${index}`
    }
    return `key-${key.token}`
  })
}

function stableRecordKey(value: unknown): { raw: string, token: string } | undefined {
  if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean')
    return undefined
  if (typeof value === 'number' && !Number.isFinite(value))
    return undefined
  const raw = `${typeof value}:${typeof value === 'number' && Object.is(value, -0) ? '-0' : String(value)}`
  return {
    raw,
    token: `${raw.length.toString(36)}-${hashKey(raw, 0x811C9DC5)}-${hashKey(raw, 0x9E3779B9)}`,
  }
}

function hashKey(value: string, seed: number): string {
  let hash = seed >>> 0
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(36)
}

function runtimeLayoutKey(node: MaterialNode<unknown>): object {
  return typeof node.model === 'object' && node.model !== null ? node.model : node
}

/**
 * Resolve staticBinding on header/footer/normal row cells.
 * Returns the row as-is if no cell has staticBinding.
 */
function resolveStaticRow(
  row: TableRowSchema,
  data: Record<string, unknown>,
  nodeId: string,
  reportDiagnostic?: ViewerRenderContext['reportDiagnostic'],
): TableRowSchema {
  const needsResolution = row.cells.some(c => c.staticBinding)
  if (!needsResolution)
    return row

  const resolvedCells: TableCellSchema[] = row.cells.map((cell) => {
    if (!cell.staticBinding)
      return cell
    const value = resolveBindingValue(cell.staticBinding, data)
    const formatted = formatCellValue(value, cell.staticBinding, data, nodeId, reportDiagnostic)
    return {
      ...cell,
      content: { text: formatted },
    }
  })
  return { ...row, cells: resolvedCells }
}

function formatCellValue(
  value: unknown,
  binding: BindingRef,
  data: Record<string, unknown>,
  nodeId: string,
  reportDiagnostic?: ViewerRenderContext['reportDiagnostic'],
): string {
  const result = formatBindingDisplayValue(value, binding, { data })
  for (const diagnostic of result.diagnostics)
    reportDiagnostic?.({ ...diagnostic, nodeId })
  return result.value
}
