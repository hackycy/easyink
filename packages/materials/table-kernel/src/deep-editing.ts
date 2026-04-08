import type { TableNode } from '@easyink/schema'
import type { CellRect } from './types'
import { computeCellRect, computeColBorderPositions, computeRowBorderPositions, hitTestGridCell } from './geometry'
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
  getNode: (nodeId: string) => TableNode | undefined
  getZoom: () => number
  getPageEl: () => HTMLElement | null
  screenToDoc: (screenVal: number, screenOrigin: number, zoom: number) => number
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
      renderGridOverlay(containers, node, shared, cleanupFns)
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
      renderGridOverlay(containers, node, shared, cleanupFns)
      renderCellHighlight(containers.overlay, node, shared, cleanupFns)
      renderToolbar(containers, node, shared, cleanupFns)
    },
    onExit() {
      for (const fn of cleanupFns) fn()
      cleanupFns = []
    },
    subSelection: {
      hitTest(point, node) {
        const gridCell = hitTestGridCell(node.table.topology, node.width, node.height, point.x, point.y)
        if (!gridCell)
          return null
        const owner = resolveMergeOwner(node.table.topology, gridCell.row, gridCell.col)
        const rect = computeCellRect(node.table.topology, node.width, node.height, owner.row, owner.col)
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
        // Keyboard is handled within the phase via the overlay's event listeners.
        // This handler is called by the orchestrator for events not consumed by DOM.
        if (!shared.selectedCell)
          return false

        if (event.key === 'Tab') {
          event.preventDefault()
          event.stopPropagation()
          // Tab navigation handled at overlay level, but fallback here
          return true
        }

        if (event.key === 'Enter') {
          event.preventDefault()
          event.stopPropagation()
          // Double-click or Enter triggers content-editing, but we can't
          // call requestTransition here since we don't have containers.
          // The orchestrator handles Enter via keyboard -> transitions.
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
      { to: 'content-editing', trigger: 'double-click' as const },
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
      renderGridOverlay(containers, node, shared, cleanupFns)

      if (!shared.selectedCell)
        return

      const rect = computeCellRect(
        node.table.topology,
        node.width,
        node.height,
        shared.selectedCell.row,
        shared.selectedCell.col,
      )
      if (!rect)
        return

      const cell = node.table.topology.rows[shared.selectedCell.row]?.cells[shared.selectedCell.col]
      snapshotText = cell?.content?.text ?? ''

      // Create input wrapper
      const wrapper = document.createElement('div')
      wrapper.style.cssText = `position:absolute;left:${rect.x}px;top:${rect.y}px;width:${rect.w}px;height:${rect.h}px;z-index:13;pointer-events:auto;`
      wrapper.addEventListener('pointerdown', e => e.stopPropagation())
      wrapper.addEventListener('mousedown', e => e.stopPropagation())
      wrapper.addEventListener('click', e => e.stopPropagation())

      inputEl = document.createElement('input')
      inputEl.type = 'text'
      inputEl.value = snapshotText
      const props = node.props as Record<string, unknown>
      inputEl.style.cssText = `width:100%;height:100%;box-sizing:border-box;border:2px solid var(--ei-primary,#1890ff);background:#fff;outline:none;font-size:${props.fontSize ?? 12}pt;color:${props.color || '#000000'};padding:${props.cellPadding ?? 4}px;`

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

      // Blur -> commit and transition back
      const onBlur = () => {
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
      if (!committed && inputEl && shared.currentNodeId) {
        commit(shared.delegate.getNode(shared.currentNodeId))
      }
      for (const fn of cleanupFns) fn()
      cleanupFns = []
      inputEl = null
    },
    keyboardHandler: {
      handleKey(event, _node) {
        // Input element handles its own keyboard events via DOM listener.
        // Stop outer handlers from interfering.
        event.stopPropagation()
        return true
      },
    },
    transitions: [
      { to: 'cell-selected', trigger: 'escape' as const },
    ],
  }
}

// ─── Shared rendering helpers ──────────────────────────────────────

function renderGridOverlay(
  containers: PhaseContainers,
  node: TableNode,
  shared: SharedState,
  cleanupFns: Array<() => void>,
): void {
  const gridEl = document.createElement('div')
  gridEl.style.cssText = 'position:absolute;inset:0;pointer-events:auto;z-index:10;'

  const colPositions = computeColBorderPositions(node.table.topology.columns, node.width)
  const rowPositions = computeRowBorderPositions(node.table.topology.rows, node.height)

  // Column grid lines
  for (const x of colPositions) {
    const line = document.createElement('div')
    line.style.cssText = `position:absolute;top:0;left:${x}px;width:1px;height:100%;background:rgba(24,144,255,0.3);pointer-events:none;`
    gridEl.appendChild(line)
  }

  // Row grid lines
  for (const y of rowPositions) {
    const line = document.createElement('div')
    line.style.cssText = `position:absolute;left:0;top:${y}px;width:100%;height:1px;background:rgba(24,144,255,0.3);pointer-events:none;`
    gridEl.appendChild(line)
  }

  // Column resize handles
  for (let i = 0; i < colPositions.length; i++) {
    const x = colPositions[i]!
    const handle = document.createElement('div')
    handle.style.cssText = `position:absolute;top:0;left:${x}px;width:6px;height:100%;margin-left:-3px;cursor:col-resize;pointer-events:auto;z-index:2;`
    handle.addEventListener('pointerdown', (e) => {
      const currentNode = shared.currentNodeId ? shared.delegate.getNode(shared.currentNodeId) : undefined
      if (currentNode)
        onColumnBorderPointerDown(e, currentNode, i, shared)
    })
    handle.addEventListener('mouseenter', () => {
      handle.style.background = 'rgba(24,144,255,0.15)'
    })
    handle.addEventListener('mouseleave', () => {
      handle.style.background = ''
    })
    gridEl.appendChild(handle)
  }

  // Row resize handles
  for (let i = 0; i < rowPositions.length; i++) {
    const y = rowPositions[i]!
    const handle = document.createElement('div')
    handle.style.cssText = `position:absolute;left:0;top:${y}px;width:100%;height:6px;margin-top:-3px;cursor:row-resize;pointer-events:auto;z-index:2;`
    handle.addEventListener('pointerdown', (e) => {
      const currentNode = shared.currentNodeId ? shared.delegate.getNode(shared.currentNodeId) : undefined
      if (currentNode)
        onRowBorderPointerDown(e, currentNode, i, shared)
    })
    handle.addEventListener('mouseenter', () => {
      handle.style.background = 'rgba(24,144,255,0.15)'
    })
    handle.addEventListener('mouseleave', () => {
      handle.style.background = ''
    })
    gridEl.appendChild(handle)
  }

  // Click -> select cell
  gridEl.addEventListener('click', (e) => {
    const currentNode = shared.currentNodeId ? shared.delegate.getNode(shared.currentNodeId) : undefined
    if (!currentNode)
      return
    const cellCoords = hitTestFromScreenEvent(e, currentNode, shared)
    if (!cellCoords)
      return
    shared.selectedCell = cellCoords
    containers.requestTransition('cell-selected')
  })

  // Double-click -> content editing
  gridEl.addEventListener('dblclick', (e) => {
    e.preventDefault()
    if (shared.selectedCell) {
      containers.requestTransition('content-editing')
    }
  })

  containers.overlay.appendChild(gridEl)
  cleanupFns.push(() => gridEl.remove())
}

function renderCellHighlight(
  overlay: HTMLElement,
  node: TableNode,
  shared: SharedState,
  cleanupFns: Array<() => void>,
): void {
  if (!shared.selectedCell)
    return

  const rect = computeCellRect(
    node.table.topology,
    node.width,
    node.height,
    shared.selectedCell.row,
    shared.selectedCell.col,
  )
  if (!rect)
    return

  const el = document.createElement('div')
  el.style.cssText = `position:absolute;left:${rect.x}px;top:${rect.y}px;width:${rect.w}px;height:${rect.h}px;border:2px solid var(--ei-primary,#1890ff);background:rgba(24,144,255,0.08);pointer-events:none;z-index:1;`

  overlay.appendChild(el)
  cleanupFns.push(() => el.remove())
}

function renderToolbar(
  containers: PhaseContainers,
  _node: TableNode,
  shared: SharedState,
  cleanupFns: Array<() => void>,
): void {
  const t = shared.delegate.t

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

  // Row operations
  addBtn(t('designer.table.insertRowAbove'), '<svg width="16" height="16" viewBox="0 0 16 16"><path d="M3 8h10M8 3v10" stroke="currentColor" fill="none" stroke-width="1.5"/><path d="M3 3h10v3H3z" fill="currentColor" opacity="0.2"/></svg>', () => {
    const n = getNode()
    if (!n || !shared.selectedCell)
      return
    shared.delegate.commitInsertRow(n, shared.selectedCell.row)
    shared.selectedCell = { row: shared.selectedCell.row + 1, col: shared.selectedCell.col }
    containers.requestTransition('cell-selected')
  })

  addBtn(t('designer.table.insertRowBelow'), '<svg width="16" height="16" viewBox="0 0 16 16"><path d="M3 8h10M8 3v10" stroke="currentColor" fill="none" stroke-width="1.5"/><path d="M3 10h10v3H3z" fill="currentColor" opacity="0.2"/></svg>', () => {
    const n = getNode()
    if (!n || !shared.selectedCell)
      return
    shared.delegate.commitInsertRow(n, shared.selectedCell.row + 1)
    containers.requestTransition('cell-selected')
  })

  addBtn(t('designer.table.removeRow'), '<svg width="16" height="16" viewBox="0 0 16 16"><path d="M3 8h10" stroke="currentColor" fill="none" stroke-width="1.5"/></svg>', () => {
    const n = getNode()
    if (!n || !shared.selectedCell || n.table.topology.rows.length <= 1)
      return
    const cp = shared.selectedCell
    shared.delegate.commitRemoveRow(n, cp.row)
    shared.selectedCell = { row: Math.min(cp.row, n.table.topology.rows.length - 1), col: cp.col }
    containers.requestTransition('cell-selected')
  }, !initNode || initNode.table.topology.rows.length <= 1)

  addSep()

  addBtn(t('designer.table.insertColLeft'), '<svg width="16" height="16" viewBox="0 0 16 16"><path d="M8 3v10M3 8h10" stroke="currentColor" fill="none" stroke-width="1.5"/><path d="M3 3h3v10H3z" fill="currentColor" opacity="0.2"/></svg>', () => {
    const n = getNode()
    if (!n || !shared.selectedCell)
      return
    shared.delegate.commitInsertCol(n, shared.selectedCell.col)
    shared.selectedCell = { row: shared.selectedCell.row, col: shared.selectedCell.col + 1 }
    containers.requestTransition('cell-selected')
  })

  addBtn(t('designer.table.insertColRight'), '<svg width="16" height="16" viewBox="0 0 16 16"><path d="M8 3v10M3 8h10" stroke="currentColor" fill="none" stroke-width="1.5"/><path d="M10 3h3v10h-3z" fill="currentColor" opacity="0.2"/></svg>', () => {
    const n = getNode()
    if (!n || !shared.selectedCell)
      return
    shared.delegate.commitInsertCol(n, shared.selectedCell.col + 1)
    containers.requestTransition('cell-selected')
  })

  addBtn(t('designer.table.removeCol'), '<svg width="16" height="16" viewBox="0 0 16 16"><path d="M8 3v10" stroke="currentColor" fill="none" stroke-width="1.5"/><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" fill="none" stroke-width="1"/></svg>', () => {
    const n = getNode()
    if (!n || !shared.selectedCell || n.table.topology.columns.length <= 1)
      return
    const cp = shared.selectedCell
    shared.delegate.commitRemoveCol(n, cp.col)
    shared.selectedCell = { row: cp.row, col: Math.min(cp.col, n.table.topology.columns.length - 1) }
    containers.requestTransition('cell-selected')
  }, !initNode || initNode.table.topology.columns.length <= 1)

  addSep()

  addBtn(t('designer.table.mergeRight'), '<svg width="16" height="16" viewBox="0 0 16 16"><path d="M6 5h4l-2 3 2 3H6" stroke="currentColor" fill="none" stroke-width="1.5"/></svg>', () => {
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

  addBtn(t('designer.table.mergeDown'), '<svg width="16" height="16" viewBox="0 0 16 16"><path d="M5 6v4l3-2 3 2V6" stroke="currentColor" fill="none" stroke-width="1.5"/></svg>', () => {
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

  if (initNode && shared.selectedCell) {
    const cp = shared.selectedCell
    const cell = initNode.table.topology.rows[cp.row]?.cells[cp.col]
    if ((cell?.colSpan ?? 1) > 1 || (cell?.rowSpan ?? 1) > 1) {
      addBtn(t('designer.table.split'), '<svg width="16" height="16" viewBox="0 0 16 16"><path d="M4 8h8M8 4v8" stroke="currentColor" fill="none" stroke-width="1.5" stroke-dasharray="2 1"/></svg>', () => {
        const n = getNode()
        if (!n || !shared.selectedCell)
          return
        shared.delegate.commitSplitCell(n, shared.selectedCell.row, shared.selectedCell.col)
        containers.requestTransition('cell-selected')
      })
    }
  }

  containers.toolbar.appendChild(row)
  cleanupFns.push(() => row.remove())
}

// ─── Column/row resize handlers ────────────────────────────────────

function onColumnBorderPointerDown(e: PointerEvent, tableNode: TableNode, colIndex: number, shared: SharedState): void {
  e.stopPropagation()
  e.preventDefault()

  const zoom = shared.delegate.getZoom()
  const startScreenX = e.clientX
  const startRatio = tableNode.table.topology.columns[colIndex]!.ratio
  const startWidth = tableNode.width

  const el = e.currentTarget as HTMLElement
  el.setPointerCapture(e.pointerId)

  function onPointerMove(ev: PointerEvent) {
    const deltaDoc = (ev.clientX - startScreenX) / zoom
    const newRatio = Math.max(4 / startWidth, startRatio + deltaDoc / startWidth)
    tableNode.table.topology.columns[colIndex]!.ratio = newRatio
    tableNode.width = startWidth + (newRatio - startRatio) * startWidth
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

function onRowBorderPointerDown(e: PointerEvent, tableNode: TableNode, rowIndex: number, shared: SharedState): void {
  e.stopPropagation()
  e.preventDefault()

  const zoom = shared.delegate.getZoom()
  const startScreenY = e.clientY
  const startRowHeight = tableNode.table.topology.rows[rowIndex]!.height
  const startElementHeight = tableNode.height

  const el = e.currentTarget as HTMLElement
  el.setPointerCapture(e.pointerId)

  function onPointerMove(ev: PointerEvent) {
    const deltaDoc = (ev.clientY - startScreenY) / zoom
    const newHeight = Math.max(4, startRowHeight + deltaDoc)
    tableNode.table.topology.rows[rowIndex]!.height = newHeight
    tableNode.height = startElementHeight + (newHeight - startRowHeight)
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

  const gridCell = hitTestGridCell(tableNode.table.topology, tableNode.width, tableNode.height, relX, relY)
  if (!gridCell)
    return null

  return resolveMergeOwner(tableNode.table.topology, gridCell.row, gridCell.col)
}
