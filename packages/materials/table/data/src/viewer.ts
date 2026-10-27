import type { LayoutFragment, LayoutRuntimeRef } from '@easyink/core'
import type { ResourceContext } from '@easyink/plugin-api'
import type { ViewerSessionRenderer } from '@easyink/plugin-api/viewer'
import type { BindingRef, MaterialNode, TableCellSchema, TableDataSchema, TableRowSchema } from '@easyink/schema'
import type { TableDataProps } from './schema'
import { extractCollectionPath, formatBindingDisplayValue, resolveBindingValue, resolveFieldFromRecord, trustedViewerHtml } from '@easyink/core'
import { computeAutoRowHeights, computeRowScaleWithVirtualRows, renderPlainTextCell, renderTableHtml } from '@easyink/material-table-kernel/viewer'
import { getNodeProps, isTableNode } from '@easyink/schema'
import { deepClone } from '@easyink/shared'
import { TABLE_DATA_PLACEHOLDER_ROW_COUNT } from './layout'

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

interface ResolvedRuntimeLayout {
  rows: TableRowSchema[]
  rowHeights: number[]
  totalHeight: number
}

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
  reportDiagnostic?: ViewerRenderContext['reportDiagnostic'],
): ResolvedRuntimeLayout {
  const tableData = node.table
  const showHeader = tableData.showHeader !== false
  const showFooter = tableData.showFooter !== false

  const expandedRows = expandRepeatTemplateRows(node.table.topology.rows, data, node.id, reportDiagnostic)
  const visibleRows = filterVisibleRows(expandedRows, showHeader, showFooter)

  const repeatRow = node.table.topology.rows.find(row => row.role === 'repeat-template')
  const baselineScale = computeRowScaleWithVirtualRows(
    node.table.topology.rows,
    declaredElementHeight,
    undefined,
    repeatRow ? { rowHeight: repeatRow.height, count: TABLE_DATA_PLACEHOLDER_ROW_COUNT } : undefined,
  )
  const baselineHeights = visibleRows.map(row => row.height * baselineScale)

  const props = getNodeProps<TableDataProps>(node)
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
  const layout = resolveRuntimeLayout(tableNode, data, node.height, context.reportDiagnostic)
  return { width: node.width, height: layout.totalHeight }
}

/** Each computation owns its prepared sources and all derived content fragments. */
export function createTableDataSession(resources: ResourceContext): ViewerSessionRenderer {
  const layouts = new Map<LayoutRuntimeRef, ResolvedRuntimeLayout>()
  resources.onDispose(() => {
    layouts.clear()
  })

  function read(ref: LayoutRuntimeRef | undefined): ResolvedRuntimeLayout {
    const layout = ref ? layouts.get(ref) : undefined
    if (!layout)
      throw new Error('Table fragment has no prepared state in this session')
    return layout
  }

  return {
    prepare(node, context) {
      if (!isTableNode(node as MaterialNode))
        throw new Error('Data table requires table topology')
      const tableNode = deepClone(node) as MaterialNode & { table: TableDataSchema }
      layouts.set(context.runtimeRef, resolveRuntimeLayout(tableNode, context.data as Record<string, unknown>, node.height, diagnostic => context.reportDiagnostic(diagnostic)))
    },
    measure(node, context) {
      return { width: node.width, height: read(context.runtimeRef).totalHeight }
    },
    render(node, context) {
      return renderTableLayout(node as MaterialNode, context as ViewerRenderContext, read(context.runtimeRef))
    },
    fragmentPaginator: {
      canPaginate: node => isTableNode(node) && node.type === 'table-data',
      getRemainingContent: fragment => read(fragment.runtimeRef).rows.filter(row => row.role !== 'header' && row.role !== 'footer').length,
      paginateFragment(input) {
        const tableNode = input.fragment.node as MaterialNode & { table: TableDataSchema }
        const layout = read(input.fragment.runtimeRef)
        if (input.availableHeight >= layout.totalHeight)
          return { currentPage: input.fragment, diagnostics: [] }
        const split = splitRuntimeRows(layout.rows, layout.rowHeights, input.availableHeight)
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
        function derive(rows: TableRowSchema[], rowHeights: number[], height: number, suffix: string): LayoutFragment {
          const child = input.createFragment(createVirtualTableNode(tableNode, rows, rowHeights, height, suffix))
          if (!child.runtimeRef)
            throw new Error('Framework did not assign a table fragment reference')
          layouts.set(child.runtimeRef, { rows: [...rows], rowHeights: [...rowHeights], totalHeight: height })
          return child
        }
        return {
          currentPage: derive(split.currentRows, split.currentHeights, split.currentHeight, `p${input.pageContext.pageIndex}`),
          nextPage: derive(split.nextRows, split.nextHeights, split.nextHeight, `p${input.pageContext.pageIndex + 1}`),
          diagnostics: [],
        }
      },
    },
  }
}

export function renderTableData(node: MaterialNode, context?: ViewerRenderContext): ViewerRenderOutput {
  const layout = isTableNode(node)
    ? resolveRuntimeLayout(node as MaterialNode & { table: TableDataSchema }, context?.data ?? {}, node.height, context?.reportDiagnostic)
    : undefined
  return renderTableLayout(node, context, layout)
}

function renderTableLayout(node: MaterialNode, context: ViewerRenderContext | undefined, layout: ResolvedRuntimeLayout | undefined): ViewerRenderOutput {
  if (!isTableNode(node)) {
    return {
      html: trustedViewerHtml('<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#f9f9f9;color:#999;font-size:12px;">[Data Table]</div>'),
    }
  }

  const props = getNodeProps<TableDataProps>(node)
  const { rows: visibleRows, rowHeights, totalHeight } = layout!

  const sizedRows: TableRowSchema[] = visibleRows.map((row, i) => ({
    ...row,
    height: rowHeights[i] ?? row.height,
  }))

  const html = renderTableHtml({
    topology: { columns: node.table.topology.columns, rows: sizedRows },
    props,
    unit: context?.unit ?? 'mm',
    elementHeight: totalHeight,
    cellRenderer: cell => renderPlainTextCell(cell.content?.text),
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

function createVirtualTableNode(
  node: MaterialNode & { table: TableDataSchema },
  rows: TableRowSchema[],
  rowHeights: number[],
  height: number,
  suffix: string,
): MaterialNode {
  const virtualTable: TableDataSchema = {
    ...node.table,
    topology: {
      ...node.table.topology,
      rows: rows.map((row, index) => ({ ...row, height: rowHeights[index] ?? row.height })),
    },
  }
  const virtualNode = {
    ...node,
    id: `${node.id}__${suffix}`,
    height,
    table: virtualTable,
  }
  return virtualNode
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
