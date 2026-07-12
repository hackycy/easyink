import type { FragmentPaginator, LayoutFragment, ViewerMeasureContext, ViewerMeasureResult, ViewerRenderContext, ViewerRenderOutput } from '@easyink/core'
import type { BindingRef, MaterialNode, TableCellSchema, TableRowSchema } from '@easyink/schema'
import type { TableDataProps } from './schema'
import { createFragmentFromNode, formatBindingDisplayValue, resolveBindingValue, resolveFieldFromRecord, viewerElement, viewerText } from '@easyink/core'
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

const runtimeLayoutCache = new WeakMap<MaterialNode<unknown>, ResolvedRuntimeLayout>()

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
  runtimeLayoutCache.set(tableNode, layout)
  return { width: node.width, height: layout.totalHeight }
}

export const tableDataFragmentPaginator: FragmentPaginator = {
  canPaginate(node) {
    return node.type === 'table-data'
  },
  paginateFragment(input) {
    const node = input.fragment.node
    if (node.type !== 'table-data') {
      return { currentPage: input.fragment, diagnostics: [] }
    }
    const tableNode = node

    const cached = runtimeLayoutCache.get(tableNode)
    if (!cached || input.availableHeight >= cached.totalHeight) {
      return { currentPage: input.fragment, diagnostics: [] }
    }

    const split = splitRuntimeRows(cached.rows, cached.rowSources, cached.rowHeights, input.availableHeight)
    if (!split) {
      return {
        currentPage: input.fragment,
        diagnostics: [{
          code: 'TABLE_DATA_FRAGMENT_OVERFLOW',
          severity: 'warning',
          message: `Table ${tableNode.id} cannot fit even one body row into the available page height.`,
          stage: 'pagination',
          sourceNodeId: input.fragment.sourceNodeId,
        }],
      }
    }

    const current = createVirtualTableFragment(input.fragment, tableNode, split.currentRows, split.currentSources, cached.columnIds, split.currentHeights, split.currentHeight, `p${input.pageContext.pageIndex}`)
    const next = createVirtualTableFragment(input.fragment, tableNode, split.nextRows, split.nextSources, cached.columnIds, split.nextHeights, split.nextHeight, `p${input.pageContext.pageIndex + 1}`)

    return {
      currentPage: current,
      nextPage: next,
      diagnostics: [],
    }
  },
}

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
  const cached = runtimeLayoutCache.get(tableNode)
  const { rows: visibleRows, rowSources, columnIds, rowHeights, totalHeight } = cached
    ?? resolveRuntimeLayout(tableNode, data, node.height, context?.reportDiagnostic)

  const sizedRows: TableRowSchema[] = visibleRows.map((row, i) => ({
    ...row,
    height: rowHeights[i] ?? row.height,
  }))

  const tree = renderTableTree({
    node,
    topology: { columns: projectTableTopology(node).topology.columns, rows: sizedRows },
    props,
    unit: context?.unit ?? 'mm',
    elementHeight: totalHeight,
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

function splitRuntimeRows(
  rows: TableRowSchema[],
  rowSources: Array<{ canonicalRowId: string, sourceRowKey: string }>,
  rowHeights: number[],
  availableHeight: number,
): { currentRows: TableRowSchema[], currentSources: Array<{ canonicalRowId: string, sourceRowKey: string }>, currentHeights: number[], currentHeight: number, nextRows: TableRowSchema[], nextSources: Array<{ canonicalRowId: string, sourceRowKey: string }>, nextHeights: number[], nextHeight: number } | null {
  interface Entry {
    row: TableRowSchema
    source: { canonicalRowId: string, sourceRowKey: string }
    height: number
  }
  const header: Entry[] = []
  const body: Entry[] = []
  const footer: Entry[] = []

  rows.forEach((row, index) => {
    const entry = { row, source: rowSources[index]!, height: rowHeights[index] ?? row.height }
    if (row.role === 'header')
      header.push(entry)
    else if (row.role === 'footer')
      footer.push(entry)
    else
      body.push(entry)
  })

  const headerHeight = sumHeights(header)
  let currentHeight = headerHeight
  let bodyCut = 0
  while (bodyCut < body.length && currentHeight + body[bodyCut]!.height <= availableHeight) {
    currentHeight += body[bodyCut]!.height
    bodyCut++
  }

  if (bodyCut === 0)
    return null

  const currentEntries = [...header, ...body.slice(0, bodyCut)]
  const nextEntries = [...header, ...body.slice(bodyCut), ...footer]
  return {
    currentRows: currentEntries.map(entry => entry.row),
    currentSources: currentEntries.map(entry => entry.source),
    currentHeights: currentEntries.map(entry => entry.height),
    currentHeight: sumHeights(currentEntries),
    nextRows: nextEntries.map(entry => entry.row),
    nextSources: nextEntries.map(entry => entry.source),
    nextHeights: nextEntries.map(entry => entry.height),
    nextHeight: sumHeights(nextEntries),
  }
}

function createVirtualTableFragment(
  source: LayoutFragment,
  node: MaterialNode<unknown>,
  rows: TableRowSchema[],
  rowSources: Array<{ canonicalRowId: string, sourceRowKey: string }>,
  columnIds: string[],
  rowHeights: number[],
  height: number,
  suffix: string,
): LayoutFragment {
  const virtualNode: MaterialNode<unknown> = {
    ...node,
    id: `${node.id}__${suffix}`,
    height,
  }
  runtimeLayoutCache.set(virtualNode, { rows, rowSources, columnIds, rowHeights, totalHeight: height })
  return {
    ...createFragmentFromNode(virtualNode),
    sourceNodeId: source.sourceNodeId,
    flow: source.flow,
  }
}

function sumHeights(entries: Array<{ height: number }>): number {
  let total = 0
  for (const entry of entries)
    total += entry.height
  return total
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
