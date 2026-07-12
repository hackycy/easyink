import type { FragmentPaginator, LayoutFragment } from '@easyink/core'
import type { BindingRef, MaterialNode, TableCellSchema, TableRowSchema } from '@easyink/schema'
import type { TableDataProps } from './schema'
import { createFragmentFromNode, extractCollectionPath, formatBindingDisplayValue, resolveBindingValue, resolveFieldFromRecord, trustedViewerHtml } from '@easyink/core'
import { computeAutoRowHeights, computeRowScaleWithVirtualRows, getTableMaterialModel, projectTableTopology, renderPlainTextCell, renderTableHtml, resolveTableBaseProps } from '@easyink/material-table-kernel'
import { TABLE_DATA_PLACEHOLDER_ROW_COUNT } from './layout'
import { TABLE_DATA_DEFAULTS } from './schema'

interface ViewerRenderContext {
  data: Record<string, unknown>
  resolvedProps: Record<string, unknown>
  pageIndex: number
  unit: string
  zoom: number
  reportDiagnostic?: (diagnostic: { code: string, message: string, severity: 'warning', nodeId?: string, cause?: unknown }) => void
}

interface ViewerRenderOutput {
  html?: ReturnType<typeof trustedViewerHtml>
  element?: HTMLElement
}

interface ViewerMeasureContext {
  data: Record<string, unknown>
  unit: string
  reportDiagnostic?: ViewerRenderContext['reportDiagnostic']
}

interface ViewerMeasureResult {
  width: number
  height: number
  overflow?: boolean
}

/**
 * Filter rows to only include visible ones based on showHeader/showFooter settings.
 */
function filterVisibleRows(rows: TableRowSchema[], showHeader: boolean, showFooter: boolean): TableRowSchema[] {
  return rows.filter((row) => {
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
  const { topology } = projectTableTopology(node)
  const expandedRows = expandRepeatTemplateRows(topology.rows, data, node.id, reportDiagnostic)
  const visibleRows = filterVisibleRows(expandedRows, true, true)

  const repeatRow = topology.rows.find(row => row.role === 'repeat-template')
  const baselineScale = computeRowScaleWithVirtualRows(
    topology.rows,
    declaredElementHeight,
    undefined,
    repeatRow ? { rowHeight: repeatRow.height, count: TABLE_DATA_PLACEHOLDER_ROW_COUNT } : undefined,
  )
  const baselineHeights = visibleRows.map(row => row.height * baselineScale)

  const props: TableDataProps = { ...TABLE_DATA_DEFAULTS, ...resolveTableBaseProps(node) }
  const rowHeights = computeAutoRowHeights({
    topology: { columns: topology.columns, rows: visibleRows },
    elementWidth: node.width,
    baselineHeights,
    props,
  })
  let totalHeight = 0
  for (const h of rowHeights)
    totalHeight += h

  return { rows: visibleRows, rowHeights, totalHeight }
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

    const split = splitRuntimeRows(cached.rows, cached.rowHeights, input.availableHeight)
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

    const current = createVirtualTableFragment(input.fragment, tableNode, split.currentRows, split.currentHeights, split.currentHeight, `p${input.pageContext.pageIndex}`)
    const next = createVirtualTableFragment(input.fragment, tableNode, split.nextRows, split.nextHeights, split.nextHeight, `p${input.pageContext.pageIndex + 1}`)

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
      html: trustedViewerHtml('<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#f9f9f9;color:#999;font-size:12px;">[Data Table]</div>'),
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
  const { rows: visibleRows, rowHeights, totalHeight } = cached
    ?? resolveRuntimeLayout(tableNode, data, node.height, context?.reportDiagnostic)

  const sizedRows: TableRowSchema[] = visibleRows.map((row, i) => ({
    ...row,
    height: rowHeights[i] ?? row.height,
  }))

  const html = renderTableHtml({
    topology: { columns: projectTableTopology(node).topology.columns, rows: sizedRows },
    props,
    unit: context?.unit ?? 'mm',
    elementHeight: totalHeight,
    cellRenderer: cell => renderPlainTextCell(cell.content?.text),
    rowDecorator: (ri) => {
      const row = sizedRows[ri]
      if (!row)
        return {}
      const modelRole = row.role === 'repeat-template' ? 'detail' : row.role === 'normal' ? 'body' : row.role
      const bg = getTableMaterialModel(node).bands.find(band => band.role === modelRole)?.style?.background ?? ''
      if (bg)
        return { cellStyle: `;background:${bg}` }
      return {}
    },
  })
  return { html: trustedViewerHtml(html) }
}

/**
 * Expand repeat-template rows into N data rows by resolving collection bindings.
 * Header/footer rows resolve staticBinding to produce content text.
 */
function expandRepeatTemplateRows(
  rows: TableRowSchema[],
  data: Record<string, unknown>,
  nodeId: string,
  reportDiagnostic?: ViewerRenderContext['reportDiagnostic'],
): TableRowSchema[] {
  const result: TableRowSchema[] = []

  for (const row of rows) {
    if (row.role !== 'repeat-template') {
      // Header/footer/normal: resolve staticBinding into content
      result.push(resolveStaticRow(row, data, nodeId, reportDiagnostic))
      continue
    }

    // Collect all binding field paths from repeat-template cells
    const bindings = row.cells
      .map(c => c.binding)
      .filter((binding): binding is BindingRef => !!binding?.fieldPath)
    const fieldPaths = bindings.map(binding => binding.fieldPath)

    if (fieldPaths.length === 0) {
      // No bindings — render as single row with static content
      result.push(row)
      continue
    }

    const collectionPath = extractCollectionPath(fieldPaths)
    if (!collectionPath) {
      result.push(row)
      continue
    }

    // Resolve collection from data
    const firstBinding = bindings[0]
    const collectionBinding: BindingRef = {
      sourceId: firstBinding?.sourceId ?? '',
      sourceTag: firstBinding?.sourceTag,
      fieldPath: collectionPath,
    }
    const collectionData = resolveBindingValue(collectionBinding, data)
    if (!Array.isArray(collectionData) || collectionData.length === 0) {
      // Empty or non-array — render single empty row
      result.push(row)
      continue
    }

    // Expand: one row per collection item
    for (const item of collectionData) {
      const record = (typeof item === 'object' && item !== null ? item : {}) as Record<string, unknown>
      const expandedCells: TableCellSchema[] = row.cells.map((cell) => {
        if (!cell.binding?.fieldPath)
          return { ...cell }
        const leafField = cell.binding.fieldPath.substring(collectionPath.length + 1)
        const value = resolveFieldFromRecord(leafField, record)
        const formatted = formatCellValue(value, cell.binding, data, nodeId, reportDiagnostic)
        return {
          ...cell,
          content: { text: formatted },
        }
      })
      result.push({ height: row.height, role: 'normal', cells: expandedCells })
    }
  }

  return result
}

function splitRuntimeRows(
  rows: TableRowSchema[],
  rowHeights: number[],
  availableHeight: number,
): { currentRows: TableRowSchema[], currentHeights: number[], currentHeight: number, nextRows: TableRowSchema[], nextHeights: number[], nextHeight: number } | null {
  const header: Array<{ row: TableRowSchema, height: number }> = []
  const body: Array<{ row: TableRowSchema, height: number }> = []
  const footer: Array<{ row: TableRowSchema, height: number }> = []

  rows.forEach((row, index) => {
    const entry = { row, height: rowHeights[index] ?? row.height }
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
    currentHeights: currentEntries.map(entry => entry.height),
    currentHeight: sumHeights(currentEntries),
    nextRows: nextEntries.map(entry => entry.row),
    nextHeights: nextEntries.map(entry => entry.height),
    nextHeight: sumHeights(nextEntries),
  }
}

function createVirtualTableFragment(
  source: LayoutFragment,
  node: MaterialNode<unknown>,
  rows: TableRowSchema[],
  rowHeights: number[],
  height: number,
  suffix: string,
): LayoutFragment {
  const virtualNode: MaterialNode<unknown> = {
    ...node,
    id: `${node.id}__${suffix}`,
    height,
  }
  runtimeLayoutCache.set(virtualNode, { rows, rowHeights, totalHeight: height })
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
