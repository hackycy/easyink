import type { DataBinding, FormatterConfig } from '@easyink/core'
import type { ElementRenderFunction } from '../../types'

interface TableColumn {
  key: string
  title: string
  width: number
  align?: 'left' | 'center' | 'right'
  binding?: DataBinding
  formatter?: FormatterConfig
}

interface TableSummaryCell {
  columnKey: string
  aggregate?: 'sum' | 'avg' | 'count' | 'max' | 'min'
  text?: string
  binding?: DataBinding
  formatter?: FormatterConfig
}

interface TableProps {
  columns: TableColumn[]
  bordered?: boolean
  header?: { height?: number, style?: Record<string, unknown> }
  summary?: { height?: number, cells: TableSummaryCell[] }
  rowHeight?: number | 'auto'
  striped?: boolean
  emptyBehavior?: 'placeholder' | 'collapse' | 'min-rows'
  minRows?: number
  emptyText?: string
}

/**
 * 动态表格元素渲染器
 *
 * 同源约束：所有列 binding.path 的点路径前缀必须一致。
 * 行数 = 源数组.length。
 */
export const renderTable: ElementRenderFunction = (node, context) => {
  const wrapper = document.createElement('div')
  wrapper.className = 'easyink-element easyink-table'
  wrapper.dataset.elementId = node.id

  const props = node.props as unknown as TableProps
  const columns = props.columns ?? []

  if (columns.length === 0)
    return wrapper

  // ── 同源校验 + 数据解析 ──
  const columnData = resolveColumns(columns, context)

  const table = document.createElement('table')
  table.style.width = '100%'
  table.style.borderCollapse = 'collapse'
  table.style.tableLayout = 'fixed'

  if (props.bordered) {
    table.style.border = '1px solid #000'
  }

  // ── 列宽 ──
  const colgroup = document.createElement('colgroup')
  for (const col of columns) {
    const colEl = document.createElement('col')
    colEl.style.width = `${col.width}%`
    colgroup.appendChild(colEl)
  }
  table.appendChild(colgroup)

  // ── 表头 ──
  const thead = document.createElement('thead')
  const headerRow = document.createElement('tr')
  for (const col of columns) {
    const th = document.createElement('th')
    th.textContent = col.title
    th.style.textAlign = col.align ?? 'left'
    if (props.bordered)
      th.style.border = '1px solid #000'
    if (props.header?.height)
      th.style.height = `${context.toPixels(props.header.height)}px`
    headerRow.appendChild(th)
  }
  thead.appendChild(headerRow)
  table.appendChild(thead)

  // ── 数据行 ──
  const rowCount = columnData.rowCount
  const tbody = document.createElement('tbody')

  if (rowCount === 0) {
    renderEmptyState(tbody, columns.length, props, context)
  }
  else {
    for (let i = 0; i < rowCount; i++) {
      const tr = document.createElement('tr')
      if (props.striped && i % 2 === 1)
        tr.style.backgroundColor = '#f9f9f9'

      for (let c = 0; c < columns.length; c++) {
        const td = document.createElement('td')
        const cellValue = columnData.columns[c]?.[i]
        td.textContent = cellValue != null ? formatCell(cellValue, columns[c], context) : ''
        td.style.textAlign = columns[c].align ?? 'left'
        if (props.bordered)
          td.style.border = '1px solid #000'
        if (props.rowHeight != null && props.rowHeight !== 'auto')
          td.style.height = `${context.toPixels(props.rowHeight)}px`
        tr.appendChild(td)
      }
      tbody.appendChild(tr)
    }
  }
  table.appendChild(tbody)

  // ── 汇总行 ──
  if (props.summary?.cells) {
    const tfoot = document.createElement('tfoot')
    const footRow = document.createElement('tr')
    for (let c = 0; c < columns.length; c++) {
      const col = columns[c]
      const td = document.createElement('td')
      const cell = props.summary.cells.find(sc => sc.columnKey === col.key)
      if (cell) {
        td.textContent = resolveSummaryCell(cell, columnData.columns[c] ?? [], context)
      }
      td.style.textAlign = col.align ?? 'left'
      if (props.bordered)
        td.style.border = '1px solid #000'
      if (props.summary.height)
        td.style.height = `${context.toPixels(props.summary.height)}px`
      footRow.appendChild(td)
    }
    tfoot.appendChild(footRow)
    table.appendChild(tfoot)
  }

  wrapper.appendChild(table)
  return wrapper
}

// ─── 辅助函数 ───

interface ColumnDataResult {
  rowCount: number
  columns: unknown[][]
}

function resolveColumns(
  columns: TableColumn[],
  context: { resolver: { resolve: (path: string, data: Record<string, unknown>) => unknown }, data: Record<string, unknown> },
): ColumnDataResult {
  const result: unknown[][] = []
  let rowCount = 0
  const prefixes: string[] = []

  for (const col of columns) {
    if (!col.binding?.path) {
      result.push([])
      continue
    }
    const resolved = context.resolver.resolve(col.binding.path, context.data)
    if (!Array.isArray(resolved)) {
      throw new TypeError(`Table column "${col.key}" binding "${col.binding.path}" must resolve to an array, got ${typeof resolved}`)
    }
    result.push(resolved)
    rowCount = Math.max(rowCount, resolved.length)

    // 同源校验：提取前缀
    const dotIdx = col.binding.path.indexOf('.')
    if (dotIdx > 0)
      prefixes.push(col.binding.path.slice(0, dotIdx))
  }

  // 同源约束检查
  if (prefixes.length > 1) {
    const first = prefixes[0]
    for (let i = 1; i < prefixes.length; i++) {
      if (prefixes[i] !== first) {
        throw new Error(`Table columns must share the same data source prefix. Found "${first}" and "${prefixes[i]}"`)
      }
    }
  }

  return { rowCount, columns: result }
}

function formatCell(
  value: unknown,
  col: TableColumn,
  context: { resolver: { format: (value: unknown, formatter: FormatterConfig) => string } },
): string {
  if (col.formatter) {
    return context.resolver.format(value, col.formatter)
  }
  return String(value)
}

function renderEmptyState(
  tbody: HTMLElement,
  colCount: number,
  props: TableProps,
  context: { toPixels: (v: number) => number },
): void {
  const behavior = props.emptyBehavior ?? 'placeholder'

  if (behavior === 'collapse')
    return

  if (behavior === 'min-rows') {
    const minRows = props.minRows ?? 1
    for (let i = 0; i < minRows; i++) {
      const tr = document.createElement('tr')
      for (let c = 0; c < colCount; c++) {
        const td = document.createElement('td')
        if (props.rowHeight != null && props.rowHeight !== 'auto')
          td.style.height = `${context.toPixels(props.rowHeight)}px`
        td.innerHTML = '&nbsp;'
        tr.appendChild(td)
      }
      tbody.appendChild(tr)
    }
    return
  }

  // placeholder
  const tr = document.createElement('tr')
  const td = document.createElement('td')
  td.colSpan = colCount
  td.textContent = props.emptyText ?? '暂无数据'
  td.style.textAlign = 'center'
  td.style.color = '#999'
  tr.appendChild(td)
  tbody.appendChild(tr)
}

function resolveSummaryCell(
  cell: TableSummaryCell,
  colValues: unknown[],
  context: { resolver: { resolve: (path: string, data: Record<string, unknown>) => unknown, format: (value: unknown, formatter: FormatterConfig) => string }, data: Record<string, unknown> },
): string {
  // 静态文本
  if (cell.text != null)
    return cell.text

  // 独立数据源绑定（最高优先级）
  if (cell.binding?.path) {
    const resolved = context.resolver.resolve(cell.binding.path, context.data)
    if (cell.formatter)
      return context.resolver.format(resolved, cell.formatter)
    return resolved != null ? String(resolved) : ''
  }

  // 内置聚合
  if (cell.aggregate) {
    const values = colValues.map(Number).filter(v => !Number.isNaN(v))
    const result = computeAggregate(cell.aggregate, values)
    if (cell.formatter)
      return context.resolver.format(result, cell.formatter)
    return String(result)
  }

  return ''
}

function computeAggregate(type: string, values: number[]): number {
  if (values.length === 0)
    return 0
  switch (type) {
    case 'sum':
      return values.reduce((a, b) => a + b, 0)
    case 'avg':
      return values.reduce((a, b) => a + b, 0) / values.length
    case 'count':
      return values.length
    case 'max':
      return Math.max(...values)
    case 'min':
      return Math.min(...values)
    default:
      return 0
  }
}
