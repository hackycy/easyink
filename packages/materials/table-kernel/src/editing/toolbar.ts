import type { EditingSessionRef } from '@easyink/core'
import type { TableCellPayload, TableEditingDelegate } from './types'
import {
  IconAlignBottom,
  IconAlignMiddle,
  IconAlignTop,
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

export interface TableToolbar {
  update: (selection: TableCellPayload | null) => void
  destroy: () => void
}

/**
 * Create self-managed toolbar DOM.
 * Dispatches BehaviorEvent.command through the session.
 */
export function createTableToolbar(
  session: EditingSessionRef,
  container: HTMLElement,
  delegate: TableEditingDelegate,
): TableToolbar {
  const t = delegate.t
  let row: HTMLElement | null = null

  function rebuild(selection: TableCellPayload | null) {
    if (row) {
      row.remove()
      row = null
    }

    if (!selection)
      return

    const kind = delegate.getTableKind()
    const node = delegate.getNode(session.nodeId)
    if (!node)
      return

    // Determine cell role for table-data
    let cellRole: string | null = null
    if (kind === 'data') {
      cellRole = node.table.topology.rows[selection.row]?.role ?? null
    }

    const isDataArea = kind === 'data' && cellRole === 'repeat-template'
    const isHeaderFooter = kind === 'data' && (cellRole === 'header' || cellRole === 'footer')

    row = document.createElement('div')
    row.style.cssText = 'display:flex;align-items:center;gap:2px;background:#fff;border:1px solid var(--ei-border-color,#d0d0d0);border-radius:4px;padding:2px 4px;box-shadow:0 1px 4px rgba(0,0,0,0.1);'

    function addBtn(title: string, svg: string, command: string, disabled?: boolean) {
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
          session.dispatch({ kind: 'command', command })
      })
      btn.addEventListener('mouseenter', () => {
        if (!btn.disabled)
          btn.style.background = 'var(--ei-hover-bg,#f0f0f0)'
      })
      btn.addEventListener('mouseleave', () => {
        btn.style.background = 'transparent'
      })
      row!.appendChild(btn)
    }

    function addSep() {
      const sep = document.createElement('span')
      sep.style.cssText = 'width:1px;height:16px;background:var(--ei-border-color,#d0d0d0);margin:0 2px;'
      row!.appendChild(sep)
    }

    // Row operations (table-static only)
    if (kind === 'static') {
      addBtn(t('designer.table.insertRowAbove'), IconTableInsertRowAbove, 'insert-row-above')
      addBtn(t('designer.table.insertRowBelow'), IconTableInsertRowBelow, 'insert-row-below')
      addBtn(t('designer.table.removeRow'), IconTableRemoveRow, 'remove-row', node.table.topology.rows.length <= 1)
      addSep()
    }

    // Column operations (all contexts)
    addBtn(t('designer.table.insertColLeft'), IconTableInsertColLeft, 'insert-col-left')
    addBtn(t('designer.table.insertColRight'), IconTableInsertColRight, 'insert-col-right')
    addBtn(t('designer.table.removeCol'), IconTableRemoveCol, 'remove-col', node.table.topology.columns.length <= 1)
    addSep()

    // Merge/Split (hidden in data area)
    if (!isDataArea) {
      addBtn(t('designer.table.mergeRight'), IconTableMerge, 'merge-right')
      if (kind === 'static') {
        addBtn(t('designer.table.mergeDown'), IconTableMerge, 'merge-down')
      }

      // Split: show when cell has span
      const cell = node.table.topology.rows[selection.row]?.cells[selection.col]
      const hasSpan = (cell?.colSpan ?? 1) > 1 || (cell?.rowSpan ?? 1) > 1
      const showSplit = isHeaderFooter ? (cell?.colSpan ?? 1) > 1 : hasSpan
      if (showSplit) {
        addBtn(t('designer.table.split'), IconTableSplit, 'split-cell')
      }

      addSep()
    }

    // Alignment (all contexts)
    addBtn(t('designer.table.alignLeft'), IconTextAlignLeft, 'align-left')
    addBtn(t('designer.table.alignCenter'), IconTextAlignCenter, 'align-center')
    addBtn(t('designer.table.alignRight'), IconTextAlignRight, 'align-right')
    addSep()
    addBtn(t('designer.table.alignTop'), IconAlignTop, 'valign-top')
    addBtn(t('designer.table.alignMiddle'), IconAlignMiddle, 'valign-middle')
    addBtn(t('designer.table.alignBottom'), IconAlignBottom, 'valign-bottom')

    container.appendChild(row)
  }

  return {
    update(selection: TableCellPayload | null) {
      rebuild(selection)
    },
    destroy() {
      if (row) {
        row.remove()
        row = null
      }
    },
  }
}
