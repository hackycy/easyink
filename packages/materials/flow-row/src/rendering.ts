import type { BindingRef, MaterialNode } from '@easyink/schema'
import type { FlowColumnDef, FlowRowProps } from './schema'
import { extractCollectionPath, formatBindingDisplayValue, resolveBindingValue, resolveFieldFromRecord } from '@easyink/core'
import { getBindingRefs, getNodeModel } from '@easyink/schema'
import { escapeAttr, escapeHtml } from '@easyink/shared'
import { FLOW_ROW_DEFAULTS, FLOW_ROW_TYPOGRAPHY_DEFAULTS } from './schema'

export interface FlowColumnLayoutRect {
  index: number
  x: number
  y: number
  w: number
  h: number
}

interface FlowSegment {
  kind: 'inline' | 'block'
  columns: Array<{ column: FlowColumnDef, index: number }>
}

export interface FlowRenderCell {
  column: FlowColumnDef
  index: number
  text: string
  binding?: BindingRef
  placeholder?: boolean
}

export interface FlowRowRenderModel {
  rows: FlowRenderCell[][]
}

export interface FlowRuntimeContext {
  data: Record<string, unknown>
  nodeId: string
  reportDiagnostic?: (diagnostic: { code: string, message: string, severity: 'warning', nodeId?: string, cause?: unknown }) => void
}

export function getFlowRowProps(node: MaterialNode): FlowRowProps {
  const raw = getNodeModel<Partial<FlowRowProps>>(node)
  return {
    ...FLOW_ROW_DEFAULTS,
    ...raw,
    paddingX: raw.paddingX ?? FLOW_ROW_DEFAULTS.paddingX,
    paddingY: raw.paddingY ?? FLOW_ROW_DEFAULTS.paddingY,
    typography: {
      ...FLOW_ROW_TYPOGRAPHY_DEFAULTS,
      ...(raw.typography ?? {}),
    },
    columns: normalizeColumns(raw.columns),
  }
}

export function normalizeColumns(columns: FlowColumnDef[] | undefined): FlowColumnDef[] {
  const source = columns && columns.length > 0 ? columns : FLOW_ROW_DEFAULTS.columns
  return source.map((column, index) => {
    const ratio = typeof column.ratio === 'number' && column.ratio > 0 ? column.ratio : 1
    const textAlign = column.textAlign === 'center' || column.textAlign === 'right' ? column.textAlign : 'left'
    const verticalAlign = column.verticalAlign === 'top' || column.verticalAlign === 'bottom' ? column.verticalAlign : 'middle'
    const wrapMode = column.wrapMode === 'block' ? 'block' : 'inline'
    return {
      id: column.id || `default-${index + 1}`,
      ratio,
      textAlign,
      verticalAlign,
      wrapMode,
      content: typeof column.content === 'string' ? column.content : '',
      bindingPort: column.bindingPort,
    }
  })
}

export function buildSegments(columns: FlowColumnDef[]): FlowSegment[] {
  const segments: FlowSegment[] = []
  let inlineGroup: FlowSegment | null = null

  columns.forEach((column, index) => {
    if (column.wrapMode === 'block') {
      if (inlineGroup) {
        segments.push(inlineGroup)
        inlineGroup = null
      }
      segments.push({ kind: 'block', columns: [{ column, index }] })
      return
    }

    if (!inlineGroup)
      inlineGroup = { kind: 'inline', columns: [] }
    inlineGroup.columns.push({ column, index })
  })

  if (inlineGroup)
    segments.push(inlineGroup)

  return segments
}

export function inferCollectionPath(node: MaterialNode, props: FlowRowProps): string | undefined {
  const binding = getBindingRefs(node.bindings.value)[0]
  if (binding?.fieldPath)
    return binding.fieldPath
  const columnPaths = props.columns
    .map(column => getFlowColumnBinding(node, column)?.fieldPath)
    .filter((fieldPath): fieldPath is string => !!fieldPath)
  return extractCollectionPath(columnPaths)
}

export function isFlowRowRuntimeRepeating(node: MaterialNode): boolean {
  return Boolean(inferCollectionPath(node, getFlowRowProps(node)))
}

export function resolveFlowRows(node: MaterialNode, context: FlowRuntimeContext): FlowRowRenderModel {
  const props = getFlowRowProps(node)
  const collectionPath = inferCollectionPath(node, props)
  const records = resolveRecords(node, props, collectionPath, context.data)

  return {
    rows: records.map(record => props.columns.map((column, index) => ({
      column,
      index,
      binding: getFlowColumnBinding(node, column),
      text: resolveColumnText(node, column, record, collectionPath, context),
    }))),
  }
}

function resolveRecords(
  node: MaterialNode,
  props: FlowRowProps,
  collectionPath: string | undefined,
  data: Record<string, unknown>,
): Record<string, unknown>[] {
  if (!collectionPath)
    return [data]

  const collectionBinding = getBindingRefs(node.bindings.value)[0]
  const source = collectionBinding?.fieldPath
    ? resolveBindingValue(collectionBinding, data)
    : resolveBindingValue({ sourceId: '', fieldPath: collectionPath }, data)

  if (Array.isArray(source)) {
    if (source.length === 0)
      return [{}]
    return source.map(item => typeof item === 'object' && item !== null ? item as Record<string, unknown> : {})
  }

  const hasColumnCollectionBindings = props.columns.some(column =>
    getFlowColumnBinding(node, column)?.fieldPath.startsWith(`${collectionPath}/`),
  )
  return hasColumnCollectionBindings ? [{}] : [data]
}

function resolveColumnText(
  node: MaterialNode,
  column: FlowColumnDef,
  record: Record<string, unknown>,
  collectionPath: string | undefined,
  context: FlowRuntimeContext,
): string {
  const binding = getFlowColumnBinding(node, column)
  if (!binding?.fieldPath)
    return column.content ?? ''

  const value = collectionPath && binding.fieldPath.startsWith(`${collectionPath}/`)
    ? resolveFieldFromRecord(binding.fieldPath.slice(collectionPath.length + 1), record)
    : resolveBindingValue(binding, context.data)

  const formatted = formatBindingDisplayValue(value, binding, { data: context.data })
  for (const diagnostic of formatted.diagnostics)
    context.reportDiagnostic?.({ ...diagnostic, nodeId: context.nodeId })
  return formatted.value
}

export function computeFlowColumnRects(node: MaterialNode): FlowColumnLayoutRect[] {
  const props = getFlowRowProps(node)
  const sampleRows = [props.columns.map((column, index) => ({ column, index, text: column.content ?? '' }))]
  return computeFlowLayout(node.width, props, sampleRows).rects
}

export function measureFlowRows(node: MaterialNode, model: FlowRowRenderModel): number {
  const props = getFlowRowProps(node)
  return computeFlowLayout(node.width, props, model.rows).height
}

export function createFlowRowPlaceholderRows(template: FlowRenderCell[] | undefined, count: number): FlowRenderCell[][] {
  if (!template || count <= 0)
    return []
  return Array.from({ length: count }, () => template.map(cell => ({
    ...cell,
    text: '',
    placeholder: true,
  })))
}

function computeFlowLayout(width: number, props: FlowRowProps, rows: FlowRenderCell[][]): { height: number, rects: FlowColumnLayoutRect[] } {
  let y = 0
  const rects: FlowColumnLayoutRect[] = []
  const segments = buildSegments(props.columns)
  const gap = Math.max(0, props.gap || 0)
  const paddingX = Math.max(0, props.paddingX || 0)
  const paddingY = Math.max(0, props.paddingY || 0)

  rows.forEach((cells, rowIndex) => {
    if (rowIndex > 0)
      y += gap

    for (const segment of segments) {
      if (segment.kind === 'block') {
        const item = segment.columns[0]!
        const cell = cells[item.index]!
        const h = estimateTextHeight(cell.text, Math.max(0, width - paddingX * 2), props) + paddingY * 2
        rects.push({ index: item.index, x: 0, y, w: width, h })
        y += h + gap
        continue
      }

      const inlineCount = segment.columns.length
      const availableWidth = Math.max(0, width - gap * Math.max(0, inlineCount - 1))
      const ratioTotal = segment.columns.reduce((sum, item) => sum + Math.max(0.0001, item.column.ratio), 0) || 1
      let x = 0
      let rowHeight = 0
      const pending: FlowColumnLayoutRect[] = []
      for (const item of segment.columns) {
        const cell = cells[item.index]!
        const w = availableWidth * Math.max(0.0001, item.column.ratio) / ratioTotal
        const h = estimateTextHeight(cell.text, Math.max(0, w - paddingX * 2), props) + paddingY * 2
        pending.push({ index: item.index, x, y, w, h })
        rowHeight = Math.max(rowHeight, h)
        x += w + gap
      }
      for (const rect of pending)
        rects.push({ ...rect, h: rowHeight })
      y += rowHeight + gap
    }

    if (segments.length > 0)
      y -= gap
  })

  return { height: Math.max(0, y), rects }
}

function estimateTextHeight(text: string, width: number, props: FlowRowProps): number {
  const typography = props.typography
  const fontSize = Math.max(0.1, typography.fontSize || FLOW_ROW_TYPOGRAPHY_DEFAULTS.fontSize)
  const lineHeight = Math.max(0.1, typography.lineHeight || FLOW_ROW_TYPOGRAPHY_DEFAULTS.lineHeight)
  const letterSpacing = Math.max(0, typography.letterSpacing || 0)
  const content = text || ' '
  const lines = content.split(/\r?\n/)
  let visualLines = 0

  for (const line of lines) {
    const lineWidth = estimateTextWidth(line || ' ', fontSize, letterSpacing)
    visualLines += Math.max(1, Math.ceil(lineWidth / Math.max(fontSize, width)))
  }

  return visualLines * fontSize * lineHeight
}

function estimateTextWidth(text: string, fontSize: number, letterSpacing: number): number {
  let width = 0
  for (const char of Array.from(text)) {
    width += /[\u3000-\u9FFF\uF900-\uFAFF]/.test(char) ? fontSize : fontSize * 0.56
    width += letterSpacing
  }
  return Math.max(fontSize, width)
}

export function renderFlowRowsHtml(
  node: MaterialNode,
  model: FlowRowRenderModel,
  unit: string,
  options: { designer?: boolean, placeholderRows?: number } = {},
): string {
  const props = getFlowRowProps(node)
  const segments = buildSegments(props.columns)
  const typography = props.typography
  const gap = Math.max(0, props.gap || 0)
  const paddingX = Math.max(0, props.paddingX || 0)
  const paddingY = Math.max(0, props.paddingY || 0)
  const bg = props.backgroundColor ? `background:${escapeAttr(props.backgroundColor)};` : ''
  const outerStyle = [
    'display:flex',
    'flex-direction:column',
    `gap:${gap}${unit}`,
    'width:100%',
    'height:100%',
    `min-height:${node.height}${unit}`,
    'box-sizing:border-box',
    options.designer ? 'overflow:hidden' : 'overflow:visible',
    `font-size:${typography.fontSize}${unit}`,
    `font-family:${escapeAttr((typography as { fontFamily?: string }).fontFamily || 'inherit')}`,
    `font-weight:${typography.fontWeight}`,
    `font-style:${typography.fontStyle}`,
    `line-height:${typography.lineHeight}`,
    `letter-spacing:${typography.letterSpacing}${unit}`,
    `color:${escapeAttr(typography.color)}`,
    bg,
  ].filter(Boolean).join(';')

  const rows = [
    ...model.rows,
    ...createFlowRowPlaceholderRows(model.rows[0], Math.max(0, options.placeholderRows ?? 0)),
  ]
  const rowBlocks = rows.map((cells, rowIndex) => {
    const isPlaceholderRow = cells.some(cell => cell.placeholder)
    const segmentHtml = segments.map((segment) => {
      if (segment.kind === 'block') {
        const item = segment.columns[0]!
        const cell = cells[item.index]!
        return renderCell(cell, unit, {
          width: '100%',
          display: 'block',
          paddingX,
          paddingY,
        })
      }

      const ratioTotal = segment.columns.reduce((sum, item) => sum + Math.max(0.0001, item.column.ratio), 0) || 1
      const children = segment.columns.map((item) => {
        const cell = cells[item.index]!
        const widthPct = Math.max(0.0001, item.column.ratio) / ratioTotal * 100
        return renderCell(cell, unit, {
          width: `${widthPct.toFixed(6)}%`,
          display: 'block',
          paddingX,
          paddingY,
        })
      }).join('')
      return `<div style="display:flex;gap:${gap}${unit};width:100%;box-sizing:border-box">${children}</div>`
    }).join('')

    const rowStyle = [
      'display:flex',
      'flex-direction:column',
      `gap:${gap}${unit}`,
      'width:100%',
      'box-sizing:border-box',
      isPlaceholderRow ? 'opacity:.36' : '',
      isPlaceholderRow ? 'pointer-events:none' : '',
    ].filter(Boolean).join(';')
    const attrs = isPlaceholderRow ? ` data-flow-row-preview="${rowIndex}" aria-hidden="true"` : ''
    return `<div${attrs} style="${rowStyle}">${segmentHtml}</div>`
  }).join('')

  const content = rowBlocks || (options.designer ? renderEmptyPlaceholder() : '')
  return `<div data-easyink-material="flow-row" style="${outerStyle}">${content}</div>`
}

function renderCell(
  cell: FlowRenderCell,
  unit: string,
  layout: { width: string, display: string, paddingX: number, paddingY: number },
): string {
  const column = cell.column
  const content = cell.placeholder ? '<span style="display:block;width:100%;height:1em;border-radius:2px;background:currentColor;opacity:.4">&nbsp;</span>' : cell.text ? escapeHtml(cell.text) : '&nbsp;'
  const label = cell.binding ? ` data-flow-row-bound="${escapeAttr(cell.binding.fieldLabel || cell.binding.fieldPath)}"` : ''
  const alignItems = column.verticalAlign === 'bottom' ? 'flex-end' : column.verticalAlign === 'middle' ? 'center' : 'flex-start'
  const style = [
    'display:flex',
    'flex-direction:column',
    `justify-content:${alignItems}`,
    `width:${layout.width}`,
    'min-width:0',
    'box-sizing:border-box',
    'white-space:normal',
    'overflow-wrap:anywhere',
    'word-break:break-word',
    `text-align:${column.textAlign}`,
    `padding:${layout.paddingY}${unit} ${layout.paddingX}${unit}`,
  ].join(';')
  return `<div data-flow-row-column="${cell.index}"${label} style="${style}"><span style="display:block;width:100%">${content}</span></div>`
}

export function getFlowColumnBinding(node: MaterialNode, column: FlowColumnDef): BindingRef | undefined {
  if (!column.bindingPort)
    return undefined
  return getBindingRefs(node.bindings[column.bindingPort])[0]
}

function renderEmptyPlaceholder(): string {
  return '<div style="opacity:.45">flow-row</div>'
}
