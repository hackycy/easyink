import type { TableDataSchema, TableNode } from '@easyink/schema'
import type { CellRect } from './types'
import {
  IconTableInsertColLeft,
  IconTableInsertColRight,
  IconTableInsertRowAbove,
  IconTableInsertRowBelow,
  IconTableMerge,
  IconTableRemoveCol,
  IconTableRemoveRow,
  IconTableSplit,
  IconTextAlignCenter,
  IconTextAlignLeft,
  IconTextAlignRight,
} from '@easyink/icons/svg-strings'
import { computeCellRect, computeRowScale, hitTestGridCell } from './geometry'
import { resolveMergeOwner } from './topology'

// ─── Callback interface (avoids dependency on @easyink/designer, @easyink/core) ───

/** Delegate for committing table mutations. Material factory provides concrete implementations. */
export interface TableDeepEditingDelegate {
  commitCellUpdate: (node: TableNode, row: number, col: number, updates: Record<string, unknown>) => void
  commitColumnResize: (node: TableNode, colIndex: number, newRatio: number, newWidth: number) => void
  commitRowResize: (node: TableNode, rowIndex: number, newHeight: number) => void
  commitInsertRow: (node: TableNode, rowIndex: number) => void
  commitInsertCol: (node: TableNode, colIndex: number) => void
  commitRemoveRow: (node: TableNode, rowIndex: number) => void
  commitRemoveCol: (node: TableNode, colIndex: number) => void
  commitMergeCells: (node: TableNode, row: number, col: number, colSpan: number, rowSpan: number) => void
  commitSplitCell: (node: TableNode, row: number, col: number) => void
  commitToggleVisibility?: (node: TableNode, field: 'showHeader' | 'showFooter', value: boolean) => void
  getNode: (nodeId: string) => TableNode | undefined
  getTableKind: () => 'static' | 'data'
  getZoom: () => number
  getPageEl: () => HTMLElement | null
  screenToDoc: (screenVal: number, screenOrigin: number, zoom: number) => number
  /** Document unit string for CSS (e.g. 'mm', 'px'). */
  getUnit: () => string
  /** The number of virtual placeholder rows rendered in designer (0 for table-static). */
  getPlaceholderRowCount: () => number
  t: (key: string) => string
}

// ─── Phase containers (mirrors designer's PhaseContainers) ─────────

interface PhaseContainers {
  overlay: HTMLElement
  toolbar: HTMLElement
  requestTransition: (phaseId: string) => void
}

// ─── Deep editing phase interface ──────────────────────────────────

export interface TableDeepEditingPhase {
  id: string
  onEnter: (containers: PhaseContainers, node: TableNode) => void
  onExit: () => void
  subSelection?: {
    hitTest: (point: { x: number, y: number }, node: TableNode) => { path: unknown, rect?: CellRect } | null
    getSelectedPath: () => unknown
    clearSelection: () => void
  }
  keyboardHandler?: {
    handleKey: (event: KeyboardEvent, node: TableNode) => boolean
  }
  transitions: Array<{
    to: string
    trigger: 'click' | 'double-click' | 'escape' | 'custom'
    guard?: (event: unknown, node: TableNode) => boolean
  }>
}

export interface TableDeepEditingResult {
  phases: TableDeepEditingPhase[]
  initialPhase: string
}

// ─── State shared across phases ────────────────────────────────────

interface SharedState {
  currentNodeId: string | undefined
  selectedCell: { row: number, col: number } | null
  delegate: TableDeepEditingDelegate
}

// ─── Factory ───────────────────────────────────────────────────────

/**
 * Compute the extra visual height added by virtual placeholder rows.
 * Returns 0 for table-static (no placeholders).
 */
function computePlaceholderHeight(node: TableNode, delegate: TableDeepEditingDelegate): number {
  const count = delegate.getPlaceholderRowCount()
  if (count <= 0)
    return 0
  const repeatRow = node.table.topology.rows.find(r => r.role === 'repeat-template')
  if (!repeatRow)
    return 0
  const rowScale = computeRowScale(node.table.topology.rows, node.height)
  return repeatRow.height * rowScale * count
}

/**
 * Compute cell rect adjusted for virtual placeholder rows.
 * Footer cells (after repeat-template) are offset downward by placeholder height.
 */
function computeCellRectWithPlaceholders(
  node: TableNode,
  row: number,
  col: number,
  delegate: TableDeepEditingDelegate,
): CellRect | null {
  const rect = computeCellRect(node.table.topology, node.width, node.height, row, col)
  if (!rect)
    return null

  const count = delegate.getPlaceholderRowCount()
  if (count <= 0)
    return rect

  const repeatIdx = node.table.topology.rows.findIndex(r => r.role === 'repeat-template')
  if (repeatIdx < 0 || row <= repeatIdx)
    return rect

  const ph = computePlaceholderHeight(node, delegate)
  return { x: rect.x, y: rect.y + ph, w: rect.w, h: rect.h }
}

/**
 * Hit-test adjusted for virtual placeholder rows.
 * Clicks in the placeholder region return null; clicks in the footer region
 * are remapped to schema coordinates by subtracting placeholder height.
 */
function hitTestWithPlaceholders(
  node: TableNode,
  relX: number,
  relY: number,
  delegate: TableDeepEditingDelegate,
): { row: number, col: number } | null {
  const count = delegate.getPlaceholderRowCount()
  if (count <= 0)
    return hitTestGridCell(node.table.topology, node.width, node.height, relX, relY)

  const repeatIdx = node.table.topology.rows.findIndex(r => r.role === 'repeat-template')
  if (repeatIdx < 0)
    return hitTestGridCell(node.table.topology, node.width, node.height, relX, relY)

  const ph = computePlaceholderHeight(node, delegate)
  const rowScale = computeRowScale(node.table.topology.rows, node.height)

  // Compute bottom edge of repeat-template row
  let repeatBottom = 0
  for (let i = 0; i <= repeatIdx; i++)
    repeatBottom += node.table.topology.rows[i]!.height * rowScale

  if (relY <= repeatBottom)
    return hitTestGridCell(node.table.topology, node.width, node.height, relX, relY)

  if (relY <= repeatBottom + ph)
    return null // Click in placeholder rows — inert

  // Click in footer region — remap to schema coordinates
  return hitTestGridCell(node.table.topology, node.width, node.height, relX, relY - ph)
}

/** Resize the overlay container to include virtual placeholder rows. */
function syncOverlaySize(overlay: HTMLElement, node: TableNode, delegate: TableDeepEditingDelegate): void {
  const u = delegate.getUnit()
  const extra = computePlaceholderHeight(node, delegate)
  overlay.style.width = `${node.width}${u}`
  overlay.style.height = `${node.height + extra}${u}`
}

/**
 * Create a table deep editing FSM definition.
 * Returns phases and initialPhase usable as a DeepEditingDefinition.
 *
 * Phase callbacks receive `containers.requestTransition` to trigger
 * phase transitions from within the FSM (e.g. toolbar button clicks).
 */
export function createTableDeepEditing(delegate: TableDeepEditingDelegate): TableDeepEditingResult {
  const shared: SharedState = {
    currentNodeId: undefined,
    selectedCell: null,
    delegate,
  }

  return {
    phases: [
      createTableSelectedPhase(shared),
      createCellSelectedPhase(shared),
      createContentEditingPhase(shared),
    ],
    initialPhase: 'table-selected',
  }
}

// ─── Phase: table-selected ─────────────────────────────────────────

function createTableSelectedPhase(shared: SharedState): TableDeepEditingPhase {
  let cleanupFns: Array<() => void> = []

  return {
    id: 'table-selected',
    onEnter(containers, node) {
      shared.currentNodeId = node.id
      shared.selectedCell = null
      syncOverlaySize(containers.overlay, node, shared.delegate)
      renderTableIndicator(containers, node, shared, cleanupFns)
    },
    onExit() {
      for (const fn of cleanupFns) fn()
      cleanupFns = []
    },
    transitions: [
      {
        to: 'cell-selected',
        trigger: 'click' as const,
        guard: (_event: unknown, node: TableNode) => node.table.topology.rows.length > 0,
      },
    ],
  }
}

// ─── Phase: cell-selected ──────────────────────────────────────────

function createCellSelectedPhase(shared: SharedState): TableDeepEditingPhase {
  let cleanupFns: Array<() => void> = []

  return {
    id: 'cell-selected',
    onEnter(containers, node) {
      shared.currentNodeId = node.id
      syncOverlaySize(containers.overlay, node, shared.delegate)
      renderClickCatchLayer(containers, node, shared, cleanupFns)
      renderCellOverlay(containers, node, shared, cleanupFns)
      renderToolbar(containers, node, shared, cleanupFns)
    },
    onExit() {
      for (const fn of cleanupFns) fn()
      cleanupFns = []
    },
    subSelection: {
      hitTest(point, node) {
        const gridCell = hitTestWithPlaceholders(node, point.x, point.y, shared.delegate)
        if (!gridCell)
          return null
        const owner = resolveMergeOwner(node.table.topology, gridCell.row, gridCell.col)
        const rect = computeCellRectWithPlaceholders(node, owner.row, owner.col, shared.delegate)
        return { path: owner, rect: rect ?? undefined }
      },
      getSelectedPath() {
        return shared.selectedCell
      },
      clearSelection() {
        shared.selectedCell = null
      },
    },
    keyboardHandler: {
      handleKey(event, node) {
        if (!shared.selectedCell)
          return false

        if (event.key === 'Tab') {
          event.preventDefault()
          event.stopPropagation()
          return true
        }

        if (event.key === 'Enter') {
          event.preventDefault()
          event.stopPropagation()
          return false
        }

        if (event.key === 'Delete') {
          event.preventDefault()
          event.stopPropagation()
          shared.delegate.commitCellUpdate(node, shared.selectedCell.row, shared.selectedCell.col, {
            content: { text: '' },
          })
          return true
        }

        return false
      },
    },
    transitions: [
      {
        to: 'content-editing',
        trigger: 'double-click' as const,
        guard: (_event: unknown, node: TableNode) => {
          // table-data data-area cells cannot enter content-editing
          if (shared.delegate.getTableKind() === 'data' && shared.selectedCell) {
            const row = node.table.topology.rows[shared.selectedCell.row]
            if (row && row.role === 'repeat-template')
              return false
          }
          return true
        },
      },
      { to: 'table-selected', trigger: 'escape' as const },
    ],
  }
}

// ─── Phase: content-editing ────────────────────────────────────────

function createContentEditingPhase(shared: SharedState): TableDeepEditingPhase {
  let cleanupFns: Array<() => void> = []
  let inputEl: HTMLInputElement | null = null
  let snapshotText = ''
  let committed = false
  /** Guard against re-entrancy: onExit removing wrapper triggers blur which calls requestTransition */
  let exiting = false

  function commit(node: TableNode | undefined) {
    if (committed)
      return
    committed = true
    if (!node || !shared.selectedCell || !inputEl)
      return
    const newText = inputEl.value
    if (newText !== snapshotText) {
      shared.delegate.commitCellUpdate(node, shared.selectedCell.row, shared.selectedCell.col, {
        content: { text: newText },
      })
    }
  }

  return {
    id: 'content-editing',
    onEnter(containers, node) {
      shared.currentNodeId = node.id
      committed = false
      exiting = false

      syncOverlaySize(containers.overlay, node, shared.delegate)

      // Click-catch layer for clicking other cells during content editing
      renderClickCatchLayer(containers, node, shared, cleanupFns)

      if (!shared.selectedCell)
        return

      const rect = computeCellRectWithPlaceholders(node, shared.selectedCell.row, shared.selectedCell.col, shared.delegate)
      if (!rect)
        return

      const u = shared.delegate.getUnit()
      const cell = node.table.topology.rows[shared.selectedCell.row]?.cells[shared.selectedCell.col]
      snapshotText = cell?.content?.text ?? ''

      // Create input wrapper
      const wrapper = document.createElement('div')
      wrapper.style.cssText = `position:absolute;left:${rect.x}${u};top:${rect.y}${u};width:${rect.w}${u};height:${rect.h}${u};z-index:13;pointer-events:auto;`
      wrapper.addEventListener('pointerdown', e => e.stopPropagation())
      wrapper.addEventListener('mousedown', e => e.stopPropagation())
      wrapper.addEventListener('click', e => e.stopPropagation())

      inputEl = document.createElement('input')
      inputEl.type = 'text'
      inputEl.value = snapshotText
      const props = node.props as Record<string, unknown>
      const typo = props.typography as Record<string, unknown> | undefined
      inputEl.style.cssText = `width:100%;height:100%;box-sizing:border-box;border:2px solid var(--ei-primary,#1890ff);background:#fff;outline:none;font-size:${typo?.fontSize ?? 12}pt;color:${typo?.color || '#000000'};padding:${props.cellPadding ?? 4}px;`

      wrapper.appendChild(inputEl)
      containers.overlay.appendChild(wrapper)
      cleanupFns.push(() => {
        wrapper.remove()
        inputEl = null
      })

      requestAnimationFrame(() => {
        if (inputEl) {
          inputEl.focus()
          inputEl.select()
        }
      })

      // Blur -> commit and transition back (skip if already exiting to prevent re-entrancy)
      const onBlur = () => {
        if (exiting)
          return
        const currentNode = shared.currentNodeId
          ? shared.delegate.getNode(shared.currentNodeId)
          : undefined
        commit(currentNode)
        if (committed) {
          containers.requestTransition('cell-selected')
        }
      }
      inputEl.addEventListener('blur', onBlur)
      cleanupFns.push(() => inputEl?.removeEventListener('blur', onBlur))

      // Key handling on the input element directly
      const onKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          e.stopPropagation()
          const currentNode = shared.currentNodeId
            ? shared.delegate.getNode(shared.currentNodeId)
            : undefined
          commit(currentNode)
          containers.requestTransition('cell-selected')
        }
        else if (e.key === 'Escape') {
          e.preventDefault()
          e.stopPropagation()
          committed = true // Cancel
          containers.requestTransition('cell-selected')
        }
        else {
          // Consume all other keys to prevent outer handlers
          e.stopPropagation()
        }
      }
      inputEl.addEventListener('keydown', onKeyDown)
      cleanupFns.push(() => inputEl?.removeEventListener('keydown', onKeyDown))

      // Render cell highlight under the input
      renderCellHighlight(containers.overlay, node, shared, cleanupFns)
    },
    onExit() {
      exiting = true
      if (!committed && inputEl && shared.currentNodeId) {
        commit(shared.delegate.getNode(shared.currentNodeId))
      }
      for (const fn of cleanupFns) fn()
      cleanupFns = []
      inputEl = null
    },
    keyboardHandler: {
      handleKey(event, _node) {
        event.stopPropagation()
        return true
      },
    },
    transitions: [
      { to: 'cell-selected', trigger: 'escape' as const },
    ],
  }
}

// ─── Rendering: table-selected indicator ──────────────────────────

/**
 * Render a subtle dashed border over the table to indicate deep-editing is active.
 * Handles click to select a cell and transition to cell-selected phase.
 */
function renderTableIndicator(
  containers: PhaseContainers,
  node: TableNode,
  shared: SharedState,
  cleanupFns: Array<() => void>,
): void {
  const el = document.createElement('div')
  el.style.cssText = 'position:absolute;inset:0;border:2px dashed rgba(24,144,255,0.4);pointer-events:auto;z-index:10;box-sizing:border-box;'

  el.addEventListener('click', (e) => {
    const currentNode = shared.currentNodeId ? shared.delegate.getNode(shared.currentNodeId) : undefined
    if (!currentNode)
      return
    const cellCoords = hitTestFromScreenEvent(e, currentNode, shared)
    if (!cellCoords)
      return
    shared.selectedCell = cellCoords
    containers.requestTransition('cell-selected')
  })

  containers.overlay.appendChild(el)
  cleanupFns.push(() => el.remove())
}

// ─── Rendering: transparent click-catch layer ─────────────────────

/**
 * Transparent full-table div that routes clicks to cell selection.
 * Used in cell-selected and content-editing phases so clicks on
 * other cells can change selection without overlay covering the full table visually.
 */
function renderClickCatchLayer(
  containers: PhaseContainers,
  node: TableNode,
  shared: SharedState,
  cleanupFns: Array<() => void>,
): void {
  const el = document.createElement('div')
  el.style.cssText = 'position:absolute;inset:0;pointer-events:auto;z-index:9;'

  el.addEventListener('click', (e) => {
    const currentNode = shared.currentNodeId ? shared.delegate.getNode(shared.currentNodeId) : undefined
    if (!currentNode)
      return
    const cellCoords = hitTestFromScreenEvent(e, currentNode, shared)
    if (!cellCoords)
      return
    // Only transition if clicking a different cell
    if (shared.selectedCell && cellCoords.row === shared.selectedCell.row && cellCoords.col === shared.selectedCell.col)
      return
    shared.selectedCell = cellCoords
    containers.requestTransition('cell-selected')
  })

  el.addEventListener('dblclick', (e) => {
    e.preventDefault()
    const currentNode = shared.currentNodeId ? shared.delegate.getNode(shared.currentNodeId) : undefined
    if (!currentNode || !shared.selectedCell)
      return
    const cellCoords = hitTestFromScreenEvent(e, currentNode, shared)
    if (!cellCoords)
      return
    if (cellCoords.row === shared.selectedCell.row && cellCoords.col === shared.selectedCell.col) {
      containers.requestTransition('content-editing')
    }
  })

  containers.overlay.appendChild(el)
  cleanupFns.push(() => el.remove())
}

// ─── Rendering: cell highlight + resize handles ───────────────────

/**
 * Render cell highlight border/background and two resize handles
 * (right column edge, bottom row edge) scoped to the selected cell.
 * Resize handles imperatively sync positions during drag.
 */
function renderCellOverlay(
  containers: PhaseContainers,
  node: TableNode,
  shared: SharedState,
  cleanupFns: Array<() => void>,
): void {
  if (!shared.selectedCell)
    return

  const rect = computeCellRectWithPlaceholders(node, shared.selectedCell.row, shared.selectedCell.col, shared.delegate)
  if (!rect)
    return

  const u = shared.delegate.getUnit()

  // Cell highlight
  const highlightEl = document.createElement('div')
  highlightEl.style.cssText = `position:absolute;left:${rect.x}${u};top:${rect.y}${u};width:${rect.w}${u};height:${rect.h}${u};border:2px solid var(--ei-primary,#1890ff);background:rgba(24,144,255,0.08);pointer-events:none;z-index:11;box-sizing:border-box;`
  containers.overlay.appendChild(highlightEl)
  cleanupFns.push(() => highlightEl.remove())

  // Determine column/row indices for resize handles (accounting for merged cells)
  const cell = node.table.topology.rows[shared.selectedCell.row]?.cells[shared.selectedCell.col]
  const colSpan = cell?.colSpan ?? 1
  const rowSpan = cell?.rowSpan ?? 1
  const rightColIndex = shared.selectedCell.col + colSpan - 1
  const bottomRowIndex = shared.selectedCell.row + rowSpan - 1

  // Only show column resize handle if not the last column
  const isLastCol = rightColIndex >= node.table.topology.columns.length - 1
  // Only show row resize handle if not the last row
  const isLastRow = bottomRowIndex >= node.table.topology.rows.length - 1

  // Declare handle refs before syncPositions so they can be referenced
  let colHandle: HTMLElement | null = null
  let rowHandle: HTMLElement | null = null

  // Sync function: updates positions of highlight and handles after resize
  function syncPositions() {
    const currentNode = shared.currentNodeId ? shared.delegate.getNode(shared.currentNodeId) : undefined
    if (!currentNode || !shared.selectedCell)
      return
    const newRect = computeCellRectWithPlaceholders(currentNode, shared.selectedCell.row, shared.selectedCell.col, shared.delegate)
    if (!newRect)
      return

    // Sync overlay container size with table size (including placeholder rows)
    syncOverlaySize(containers.overlay, currentNode, shared.delegate)

    // Sync highlight
    highlightEl.style.left = `${newRect.x}${u}`
    highlightEl.style.top = `${newRect.y}${u}`
    highlightEl.style.width = `${newRect.w}${u}`
    highlightEl.style.height = `${newRect.h}${u}`

    // Sync column resize handle
    if (colHandle) {
      colHandle.style.left = `${newRect.x + newRect.w}${u}`
      colHandle.style.top = `${newRect.y}${u}`
      colHandle.style.height = `${newRect.h}${u}`
    }

    // Sync row resize handle
    if (rowHandle) {
      rowHandle.style.left = `${newRect.x}${u}`
      rowHandle.style.top = `${newRect.y + newRect.h}${u}`
      rowHandle.style.width = `${newRect.w}${u}`
    }
  }

  // Column resize handle (right edge of selected cell)
  if (!isLastCol) {
    colHandle = document.createElement('div')
    colHandle.style.cssText = `position:absolute;left:${rect.x + rect.w}${u};top:${rect.y}${u};width:6px;height:${rect.h}${u};margin-left:-3px;cursor:col-resize;pointer-events:auto;z-index:12;`
    colHandle.addEventListener('pointerdown', (e) => {
      const currentNode = shared.currentNodeId ? shared.delegate.getNode(shared.currentNodeId) : undefined
      if (currentNode)
        onColumnBorderPointerDown(e, currentNode, rightColIndex, shared, syncPositions)
    })
    colHandle.addEventListener('mouseenter', () => {
      if (colHandle)
        colHandle.style.background = 'rgba(24,144,255,0.15)'
    })
    colHandle.addEventListener('mouseleave', () => {
      if (colHandle)
        colHandle.style.background = ''
    })
    containers.overlay.appendChild(colHandle)
    cleanupFns.push(() => colHandle?.remove())
  }

  // Row resize handle (bottom edge of selected cell)
  if (!isLastRow) {
    rowHandle = document.createElement('div')
    rowHandle.style.cssText = `position:absolute;left:${rect.x}${u};top:${rect.y + rect.h}${u};width:${rect.w}${u};height:6px;margin-top:-3px;cursor:row-resize;pointer-events:auto;z-index:12;`
    rowHandle.addEventListener('pointerdown', (e) => {
      const currentNode = shared.currentNodeId ? shared.delegate.getNode(shared.currentNodeId) : undefined
      if (currentNode)
        onRowBorderPointerDown(e, currentNode, bottomRowIndex, shared, syncPositions)
    })
    rowHandle.addEventListener('mouseenter', () => {
      if (rowHandle)
        rowHandle.style.background = 'rgba(24,144,255,0.15)'
    })
    rowHandle.addEventListener('mouseleave', () => {
      if (rowHandle)
        rowHandle.style.background = ''
    })
    containers.overlay.appendChild(rowHandle)
    cleanupFns.push(() => rowHandle?.remove())
  }
}

// ─── Rendering: cell highlight only (for content-editing) ─────────

function renderCellHighlight(
  overlay: HTMLElement,
  node: TableNode,
  shared: SharedState,
  cleanupFns: Array<() => void>,
): void {
  if (!shared.selectedCell)
    return

  const rect = computeCellRectWithPlaceholders(node, shared.selectedCell.row, shared.selectedCell.col, shared.delegate)
  if (!rect)
    return

  const u = shared.delegate.getUnit()
  const el = document.createElement('div')
  el.style.cssText = `position:absolute;left:${rect.x}${u};top:${rect.y}${u};width:${rect.w}${u};height:${rect.h}${u};border:2px solid var(--ei-primary,#1890ff);background:rgba(24,144,255,0.08);pointer-events:none;z-index:1;`

  overlay.appendChild(el)
  cleanupFns.push(() => el.remove())
}

// ─── Rendering: toolbar ───────────────────────────────────────────

function renderToolbar(
  containers: PhaseContainers,
  _node: TableNode,
  shared: SharedState,
  cleanupFns: Array<() => void>,
): void {
  const t = shared.delegate.t
  const kind = shared.delegate.getTableKind()

  const row = document.createElement('div')
  row.style.cssText = 'display:flex;align-items:center;gap:2px;background:#fff;border:1px solid var(--ei-border-color,#d0d0d0);border-radius:4px;padding:2px 4px;box-shadow:0 1px 4px rgba(0,0,0,0.1);'

  function addBtn(title: string, svg: string, onClick: () => void, disabled?: boolean) {
    const btn = document.createElement('button')
    btn.style.cssText = 'display:flex;align-items:center;justify-content:center;width:24px;height:24px;border:none;background:transparent;border-radius:3px;cursor:pointer;color:var(--ei-text-primary,#333);padding:0;'
    btn.title = title
    btn.innerHTML = svg
    if (disabled) {
      btn.disabled = true
      btn.style.opacity = '0.35'
      btn.style.cursor = 'default'
    }
    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      if (!btn.disabled)
        onClick()
    })
    btn.addEventListener('mouseenter', () => {
      if (!btn.disabled)
        btn.style.background = 'var(--ei-hover-bg,#f0f0f0)'
    })
    btn.addEventListener('mouseleave', () => {
      btn.style.background = 'transparent'
    })
    row.appendChild(btn)
  }

  function addSep() {
    const sep = document.createElement('span')
    sep.style.cssText = 'width:1px;height:16px;background:var(--ei-border-color,#d0d0d0);margin:0 2px;'
    row.appendChild(sep)
  }

  function getNode(): TableNode | undefined {
    return shared.currentNodeId ? shared.delegate.getNode(shared.currentNodeId) : undefined
  }

  const initNode = getNode()

  // Determine selected cell's role for table-data
  let cellRole: string | null = null
  if (kind === 'data' && initNode && shared.selectedCell) {
    cellRole = initNode.table.topology.rows[shared.selectedCell.row]?.role ?? null
  }

  const isDataArea = kind === 'data' && cellRole === 'repeat-template'
  const isHeaderFooter = kind === 'data' && (cellRole === 'header' || cellRole === 'footer')

  // ── Row operations (table-static only) ──
  if (kind === 'static') {
    addBtn(t('designer.table.insertRowAbove'), IconTableInsertRowAbove, () => {
      const n = getNode()
      if (!n || !shared.selectedCell)
        return
      shared.delegate.commitInsertRow(n, shared.selectedCell.row)
      shared.selectedCell = { row: shared.selectedCell.row + 1, col: shared.selectedCell.col }
      containers.requestTransition('cell-selected')
    })

    addBtn(t('designer.table.insertRowBelow'), IconTableInsertRowBelow, () => {
      const n = getNode()
      if (!n || !shared.selectedCell)
        return
      shared.delegate.commitInsertRow(n, shared.selectedCell.row + 1)
      containers.requestTransition('cell-selected')
    })

    addBtn(t('designer.table.removeRow'), IconTableRemoveRow, () => {
      const n = getNode()
      if (!n || !shared.selectedCell || n.table.topology.rows.length <= 1)
        return
      const cp = shared.selectedCell
      shared.delegate.commitRemoveRow(n, cp.row)
      shared.selectedCell = { row: Math.min(cp.row, n.table.topology.rows.length - 1), col: cp.col }
      containers.requestTransition('cell-selected')
    }, !initNode || initNode.table.topology.rows.length <= 1)

    addSep()
  }

  // ── Column operations (all contexts) ──
  addBtn(t('designer.table.insertColLeft'), IconTableInsertColLeft, () => {
    const n = getNode()
    if (!n || !shared.selectedCell)
      return
    shared.delegate.commitInsertCol(n, shared.selectedCell.col)
    shared.selectedCell = { row: shared.selectedCell.row, col: shared.selectedCell.col + 1 }
    containers.requestTransition('cell-selected')
  })

  addBtn(t('designer.table.insertColRight'), IconTableInsertColRight, () => {
    const n = getNode()
    if (!n || !shared.selectedCell)
      return
    shared.delegate.commitInsertCol(n, shared.selectedCell.col + 1)
    containers.requestTransition('cell-selected')
  })

  addBtn(t('designer.table.removeCol'), IconTableRemoveCol, () => {
    const n = getNode()
    if (!n || !shared.selectedCell || n.table.topology.columns.length <= 1)
      return
    const cp = shared.selectedCell
    shared.delegate.commitRemoveCol(n, cp.col)
    shared.selectedCell = { row: cp.row, col: Math.min(cp.col, n.table.topology.columns.length - 1) }
    containers.requestTransition('cell-selected')
  }, !initNode || initNode.table.topology.columns.length <= 1)

  addSep()

  // ── Merge/Split (table-static: any direction; table-data header/footer: column only; data area: hidden) ──
  if (!isDataArea) {
    // Merge right (all non-data-area contexts)
    addBtn(t('designer.table.mergeRight'), IconTableMerge, () => {
      const n = getNode()
      if (!n || !shared.selectedCell)
        return
      const cp = shared.selectedCell
      const cell = n.table.topology.rows[cp.row]?.cells[cp.col]
      const cs = cell?.colSpan ?? 1
      const ncs = Math.min(cs + 1, n.table.topology.columns.length - cp.col)
      if (ncs <= cs)
        return
      shared.delegate.commitMergeCells(n, cp.row, cp.col, ncs, cell?.rowSpan ?? 1)
      containers.requestTransition('cell-selected')
    })

    // Merge down (table-static only, not header/footer)
    if (kind === 'static') {
      addBtn(t('designer.table.mergeDown'), IconTableMerge, () => {
        const n = getNode()
        if (!n || !shared.selectedCell)
          return
        const cp = shared.selectedCell
        const cell = n.table.topology.rows[cp.row]?.cells[cp.col]
        const rs = cell?.rowSpan ?? 1
        const nrs = Math.min(rs + 1, n.table.topology.rows.length - cp.row)
        if (nrs <= rs)
          return
        shared.delegate.commitMergeCells(n, cp.row, cp.col, cell?.colSpan ?? 1, nrs)
        containers.requestTransition('cell-selected')
      })
    }

    // Split (show when cell has any span)
    if (initNode && shared.selectedCell) {
      const cp = shared.selectedCell
      const cell = initNode.table.topology.rows[cp.row]?.cells[cp.col]
      const hasSpan = (cell?.colSpan ?? 1) > 1 || (cell?.rowSpan ?? 1) > 1
      // For header/footer only show split if colSpan > 1
      const showSplit = isHeaderFooter ? (cell?.colSpan ?? 1) > 1 : hasSpan
      if (showSplit) {
        addBtn(t('designer.table.split'), IconTableSplit, () => {
          const n = getNode()
          if (!n || !shared.selectedCell)
            return
          shared.delegate.commitSplitCell(n, shared.selectedCell.row, shared.selectedCell.col)
          containers.requestTransition('cell-selected')
        })
      }
    }

    addSep()
  }

  // ── Alignment (all contexts) ──
  addBtn(t('designer.table.alignLeft'), IconTextAlignLeft, () => {
    const n = getNode()
    if (!n || !shared.selectedCell)
      return
    shared.delegate.commitCellUpdate(n, shared.selectedCell.row, shared.selectedCell.col, {
      typography: { textAlign: 'left' },
    })
    containers.requestTransition('cell-selected')
  })

  addBtn(t('designer.table.alignCenter'), IconTextAlignCenter, () => {
    const n = getNode()
    if (!n || !shared.selectedCell)
      return
    shared.delegate.commitCellUpdate(n, shared.selectedCell.row, shared.selectedCell.col, {
      typography: { textAlign: 'center' },
    })
    containers.requestTransition('cell-selected')
  })

  addBtn(t('designer.table.alignRight'), IconTextAlignRight, () => {
    const n = getNode()
    if (!n || !shared.selectedCell)
      return
    shared.delegate.commitCellUpdate(n, shared.selectedCell.row, shared.selectedCell.col, {
      typography: { textAlign: 'right' },
    })
    containers.requestTransition('cell-selected')
  })

  // ── Visibility toggles (table-data header/footer only) ──
  if (kind === 'data' && shared.delegate.commitToggleVisibility) {
    addSep()
    const tableData = initNode?.table as TableDataSchema | undefined
    const headerVisible = tableData?.showHeader !== false
    const footerVisible = tableData?.showFooter !== false

    addBtn(
      headerVisible ? t('designer.table.hideHeader') : t('designer.table.showHeader'),
      headerVisible ? '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>' : '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/></svg>',
      () => {
        const n = getNode()
        if (!n)
          return
        shared.delegate.commitToggleVisibility!(n, 'showHeader', !headerVisible)
        containers.requestTransition('cell-selected')
      },
    )

    addBtn(
      footerVisible ? t('designer.table.hideFooter') : t('designer.table.showFooter'),
      footerVisible ? '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>' : '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/></svg>',
      () => {
        const n = getNode()
        if (!n)
          return
        shared.delegate.commitToggleVisibility!(n, 'showFooter', !footerVisible)
        containers.requestTransition('cell-selected')
      },
    )
  }

  containers.toolbar.appendChild(row)
  cleanupFns.push(() => row.remove())
}

// ─── Column/row resize handlers ────────────────────────────────────

function onColumnBorderPointerDown(
  e: PointerEvent,
  tableNode: TableNode,
  colIndex: number,
  shared: SharedState,
  onResizeMove?: () => void,
): void {
  e.stopPropagation()
  e.preventDefault()

  const zoom = shared.delegate.getZoom()
  const startScreenX = e.clientX
  const startRatio = tableNode.table.topology.columns[colIndex]!.ratio
  const startWidth = tableNode.width
  // Use screenToDoc difference for unit-correct delta computation
  const baseDocX = shared.delegate.screenToDoc(startScreenX, 0, zoom)

  const el = e.currentTarget as HTMLElement
  el.setPointerCapture(e.pointerId)

  function onPointerMove(ev: PointerEvent) {
    const deltaDoc = shared.delegate.screenToDoc(ev.clientX, 0, zoom) - baseDocX
    const newRatio = Math.max(4 / startWidth, startRatio + deltaDoc / startWidth)
    tableNode.table.topology.columns[colIndex]!.ratio = newRatio
    tableNode.width = startWidth + (newRatio - startRatio) * startWidth
    onResizeMove?.()
  }

  function onPointerUp(ev: PointerEvent) {
    el.releasePointerCapture(ev.pointerId)
    el.removeEventListener('pointermove', onPointerMove)
    el.removeEventListener('pointerup', onPointerUp)
    const currentRatio = tableNode.table.topology.columns[colIndex]!.ratio
    const currentWidth = tableNode.width
    tableNode.table.topology.columns[colIndex]!.ratio = startRatio
    tableNode.width = startWidth
    if (currentRatio !== startRatio)
      shared.delegate.commitColumnResize(tableNode, colIndex, currentRatio, currentWidth)
  }

  el.addEventListener('pointermove', onPointerMove)
  el.addEventListener('pointerup', onPointerUp)
}

function onRowBorderPointerDown(
  e: PointerEvent,
  tableNode: TableNode,
  rowIndex: number,
  shared: SharedState,
  onResizeMove?: () => void,
): void {
  e.stopPropagation()
  e.preventDefault()

  const zoom = shared.delegate.getZoom()
  const startScreenY = e.clientY
  const startRowHeight = tableNode.table.topology.rows[rowIndex]!.height
  const startElementHeight = tableNode.height
  // Use screenToDoc difference for unit-correct delta computation
  const baseDocY = shared.delegate.screenToDoc(startScreenY, 0, zoom)

  const el = e.currentTarget as HTMLElement
  el.setPointerCapture(e.pointerId)

  function onPointerMove(ev: PointerEvent) {
    const deltaDoc = shared.delegate.screenToDoc(ev.clientY, 0, zoom) - baseDocY
    const newHeight = Math.max(4, startRowHeight + deltaDoc)
    tableNode.table.topology.rows[rowIndex]!.height = newHeight
    tableNode.height = startElementHeight + (newHeight - startRowHeight)
    onResizeMove?.()
  }

  function onPointerUp(ev: PointerEvent) {
    el.releasePointerCapture(ev.pointerId)
    el.removeEventListener('pointermove', onPointerMove)
    el.removeEventListener('pointerup', onPointerUp)
    const currentHeight = tableNode.table.topology.rows[rowIndex]!.height
    tableNode.table.topology.rows[rowIndex]!.height = startRowHeight
    tableNode.height = startElementHeight
    if (currentHeight !== startRowHeight)
      shared.delegate.commitRowResize(tableNode, rowIndex, currentHeight)
  }

  el.addEventListener('pointermove', onPointerMove)
  el.addEventListener('pointerup', onPointerUp)
}

// ─── Coordinate conversion ─────────────────────────────────────────

function hitTestFromScreenEvent(
  e: MouseEvent,
  tableNode: TableNode,
  shared: SharedState,
): { row: number, col: number } | null {
  const pageEl = shared.delegate.getPageEl()
  if (!pageEl)
    return null

  const zoom = shared.delegate.getZoom()
  const pageRect = pageEl.getBoundingClientRect()
  const docX = shared.delegate.screenToDoc(e.clientX, pageRect.left, zoom)
  const docY = shared.delegate.screenToDoc(e.clientY, pageRect.top, zoom)
  const relX = docX - tableNode.x
  const relY = docY - tableNode.y

  const gridCell = hitTestWithPlaceholders(tableNode, relX, relY, shared.delegate)
  if (!gridCell)
    return null

  return resolveMergeOwner(tableNode.table.topology, gridCell.row, gridCell.col)
}
