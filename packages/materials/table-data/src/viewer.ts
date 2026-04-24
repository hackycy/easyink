import type { BindingRef, MaterialNode, TableCellSchema, TableDataSchema, TableRowSchema } from '@easyink/schema'
import type { TableDataProps } from './schema'
import { extractCollectionPath, resolveBindingValue, resolveFieldFromRecord } from '@easyink/core'
import { computeAutoRowHeights, computeRowScale, renderTableHtml } from '@easyink/material-table-kernel'
import { isTableNode } from '@easyink/schema'

interface ViewerRenderContext {
  data: Record<string, unknown>
  resolvedProps: Record<string, unknown>
  pageIndex: number
  unit: string
  zoom: number
}

interface ViewerRenderOutput {
  html?: string
  element?: HTMLElement
}

interface ViewerMeasureContext {
  data: Record<string, unknown>
  unit: string
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
 * `node.table` (object identity). Render needs the same per-row heights
 * the measure pass produced, but ViewerRuntime overwrites `node.height`
 * after measure — so re-deriving the baseline scale from the post-measure
 * `node.height` would multiply the heights again. The runtime preserves
 * `node.table` by reference across the spread, so this WeakMap survives
 * the measure→render hop with zero schema mutation.
 */
interface ResolvedRuntimeLayout {
  rows: TableRowSchema[]
  rowHeights: number[]
  totalHeight: number
}

const runtimeLayoutCache = new WeakMap<TableDataSchema, ResolvedRuntimeLayout>()

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
  node: MaterialNode & { table: TableDataSchema },
  data: Record<string, unknown>,
  declaredElementHeight: number,
): ResolvedRuntimeLayout {
  const tableData = node.table
  const showHeader = tableData.showHeader !== false
  const showFooter = tableData.showFooter !== false

  const expandedRows = expandRepeatTemplateRows(node.table.topology.rows, data)
  const visibleRows = filterVisibleRows(expandedRows, showHeader, showFooter)

  // Baseline scale from ORIGINAL declared topology + ORIGINAL element height.
  // Each row keeps its declared visual size after repeat-template expansion.
  const baselineScale = computeRowScale(node.table.topology.rows, declaredElementHeight)
  const baselineHeights = visibleRows.map(row => row.height * baselineScale)

  const props = (node.props ?? {}) as unknown as TableDataProps
  const rowHeights = computeAutoRowHeights({
    topology: { columns: node.table.topology.columns, rows: visibleRows },
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
export function measureTableData(node: MaterialNode, context: ViewerMeasureContext): ViewerMeasureResult {
  if (!isTableNode(node)) {
    return { width: node.width, height: node.height }
  }
  const data = context.data ?? {}
  const tableNode = node as MaterialNode & { table: TableDataSchema }
  const layout = resolveRuntimeLayout(tableNode, data, node.height)
  // Cache so render() reuses the exact same per-row heights without
  // re-deriving baseline scale from the (about to be overwritten) node.height.
  runtimeLayoutCache.set(tableNode.table, layout)
  return { width: node.width, height: layout.totalHeight }
}

export function renderTableData(node: MaterialNode, context?: ViewerRenderContext): ViewerRenderOutput {
  if (!isTableNode(node)) {
    return {
      html: '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#f9f9f9;color:#999;font-size:12px;">[Data Table]</div>',
    }
  }

  const props = node.props as unknown as TableDataProps
  const data = context?.data ?? {}
  const tableNode = node as MaterialNode & { table: TableDataSchema }

  // Prefer the layout produced by measure() — `node.height` has been
  // overwritten by ViewerRuntime, so we cannot recompute baseline scale
  // from it here. Fall back to a direct compute when render is called
  // without a prior measure (e.g. unit tests).
  const cached = runtimeLayoutCache.get(tableNode.table)
  const { rows: visibleRows, rowHeights, totalHeight } = cached
    ?? resolveRuntimeLayout(tableNode, data, node.height)

  const sizedRows: TableRowSchema[] = visibleRows.map((row, i) => ({
    ...row,
    height: rowHeights[i] ?? row.height,
  }))

  const html = renderTableHtml({
    topology: { columns: node.table.topology.columns, rows: sizedRows },
    props,
    unit: context?.unit ?? 'mm',
    elementHeight: totalHeight,
    cellRenderer: cell => cell.content?.text || '',
    rowDecorator: (ri) => {
      const row = sizedRows[ri]
      if (!row)
        return {}
      const bg = row.role === 'header'
        ? props.headerBackground
        : row.role === 'footer'
          ? props.summaryBackground
          : ''
      if (bg)
        return { cellStyle: `;background:${bg}` }
      // Striped rows: apply to non-header/footer rows at odd indices
      if (props.stripedRows && props.stripedColor && row.role !== 'header' && row.role !== 'footer' && ri % 2 === 1)
        return { cellStyle: `;background:${props.stripedColor}` }
      return {}
    },
  })
  return { html }
}

/**
 * Expand repeat-template rows into N data rows by resolving collection bindings.
 * Header/footer rows resolve staticBinding to produce content text.
 */
function expandRepeatTemplateRows(
  rows: TableRowSchema[],
  data: Record<string, unknown>,
): TableRowSchema[] {
  const result: TableRowSchema[] = []

  for (const row of rows) {
    if (row.role !== 'repeat-template') {
      // Header/footer/normal: resolve staticBinding into content
      result.push(resolveStaticRow(row, data))
      continue
    }

    // Collect all binding field paths from repeat-template cells
    const fieldPaths = row.cells
      .filter(c => c.binding?.fieldPath)
      .map(c => c.binding!.fieldPath)

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
    const collectionBinding: BindingRef = { sourceId: '', fieldPath: collectionPath }
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
        return {
          ...cell,
          content: { text: value != null ? String(value) : '' },
        }
      })
      result.push({ height: row.height, role: 'normal', cells: expandedCells })
    }
  }

  return result
}

/**
 * Resolve staticBinding on header/footer/normal row cells.
 * Returns the row as-is if no cell has staticBinding.
 */
function resolveStaticRow(
  row: TableRowSchema,
  data: Record<string, unknown>,
): TableRowSchema {
  const needsResolution = row.cells.some(c => c.staticBinding)
  if (!needsResolution)
    return row

  const resolvedCells: TableCellSchema[] = row.cells.map((cell) => {
    if (!cell.staticBinding)
      return cell
    const value = resolveBindingValue(cell.staticBinding, data)
    return {
      ...cell,
      content: { text: value != null ? String(value) : '' },
    }
  })
  return { ...row, cells: resolvedCells }
}
