import type { EditingSessionRef } from '@easyink/core'
import type { TableNode } from '@easyink/schema'
import type { MaterialToolbarGroup } from '@easyink/shared'
import type { TableCellPayload, TableEditingDelegate } from './types'
import {
  IconAlignBottom,
  IconAlignMiddle,
  IconAlignTop,
  IconTableInsertColLeft,
  IconTableInsertColRight,
  IconTableInsertRowAbove,
  IconTableInsertRowBelow,
  IconTableMergeDown,
  IconTableMergeRight,
  IconTableRemoveCol,
  IconTableRemoveRow,
  IconTableSplit,
  IconTextAlignCenter,
  IconTextAlignLeft,
  IconTextAlignRight,
} from '@easyink/icons/svg-strings'
import {
  materialToolbarButtonStyle,
  materialToolbarGroupStyle,
  materialToolbarIconStyle,
  materialToolbarShellStyle,
} from '@easyink/shared'

export interface TableToolbar {
  update: (selection: TableCellPayload | null) => void
  destroy: () => void
}

export function createTableToolbarGroups(
  selection: TableCellPayload | null,
  node: TableNode | undefined,
  delegate: TableEditingDelegate,
): MaterialToolbarGroup[] {
  const t = delegate.t
  if (!selection || !node)
    return []

  const kind = delegate.getTableKind()
  const cellRole = kind === 'data'
    ? node.table.topology.rows[selection.row]?.role ?? null
    : null
  const isDataArea = kind === 'data' && cellRole === 'repeat-template'
  const isHeaderFooter = kind === 'data' && (cellRole === 'header' || cellRole === 'footer')

  const groups: MaterialToolbarGroup[] = []

  if (kind === 'static') {
    groups.push({
      id: 'table.rows',
      actions: [
        { id: 'insert-row-above', label: t('designer.table.insertRowAbove'), icon: IconTableInsertRowAbove, command: 'insert-row-above' },
        { id: 'insert-row-below', label: t('designer.table.insertRowBelow'), icon: IconTableInsertRowBelow, command: 'insert-row-below' },
        {
          id: 'remove-row',
          label: t('designer.table.removeRow'),
          icon: IconTableRemoveRow,
          command: 'remove-row',
          disabled: node.table.topology.rows.length <= 1,
          danger: true,
        },
      ],
    })
  }

  groups.push({
    id: 'table.columns',
    actions: [
      { id: 'insert-col-left', label: t('designer.table.insertColLeft'), icon: IconTableInsertColLeft, command: 'insert-col-left' },
      { id: 'insert-col-right', label: t('designer.table.insertColRight'), icon: IconTableInsertColRight, command: 'insert-col-right' },
      {
        id: 'remove-col',
        label: t('designer.table.removeCol'),
        icon: IconTableRemoveCol,
        command: 'remove-col',
        disabled: node.table.topology.columns.length <= 1,
        danger: true,
      },
    ],
  })

  if (!isDataArea) {
    const cell = node.table.topology.rows[selection.row]?.cells[selection.col]
    const hasSpan = (cell?.colSpan ?? 1) > 1 || (cell?.rowSpan ?? 1) > 1
    const showSplit = isHeaderFooter ? (cell?.colSpan ?? 1) > 1 : hasSpan
    const spanActions: MaterialToolbarGroup['actions'] = [
      { id: 'merge-right', label: t('designer.table.mergeRight'), icon: IconTableMergeRight, command: 'merge-right' },
    ]
    if (kind === 'static')
      spanActions.push({ id: 'merge-down', label: t('designer.table.mergeDown'), icon: IconTableMergeDown, command: 'merge-down' })
    if (showSplit)
      spanActions.push({ id: 'split-cell', label: t('designer.table.split'), icon: IconTableSplit, command: 'split-cell' })
    groups.push({ id: 'table.spans', actions: spanActions })
  }

  groups.push(
    {
      id: 'table.horizontal-align',
      actions: [
        { id: 'align-left', label: t('designer.table.alignLeft'), icon: IconTextAlignLeft, command: 'align-left' },
        { id: 'align-center', label: t('designer.table.alignCenter'), icon: IconTextAlignCenter, command: 'align-center' },
        { id: 'align-right', label: t('designer.table.alignRight'), icon: IconTextAlignRight, command: 'align-right' },
      ],
    },
    {
      id: 'table.vertical-align',
      actions: [
        { id: 'valign-top', label: t('designer.table.alignTop'), icon: IconAlignTop, command: 'valign-top' },
        { id: 'valign-middle', label: t('designer.table.alignMiddle'), icon: IconAlignMiddle, command: 'valign-middle' },
        { id: 'valign-bottom', label: t('designer.table.alignBottom'), icon: IconAlignBottom, command: 'valign-bottom' },
      ],
    },
  )

  return groups
}

/**
 * Backward-compatible DOM renderer for hosts that mount table toolbar
 * themselves. Designer decorations render the same action model through Vue
 * so toolbar placement stays material-frame anchored.
 */
export function createTableToolbar(
  session: EditingSessionRef,
  container: HTMLElement,
  delegate: TableEditingDelegate,
): TableToolbar {
  let root: HTMLElement | null = null

  function applyStyle(el: HTMLElement, style: Record<string, string>) {
    Object.assign(el.style, style)
  }

  function appendIcon(el: HTMLElement, icon: string) {
    const span = document.createElement('span')
    span.innerHTML = icon
    applyStyle(span, materialToolbarIconStyle())
    el.appendChild(span)
  }

  function rebuild(selection: TableCellPayload | null) {
    root?.remove()
    root = null

    const groups = createTableToolbarGroups(selection, delegate.getNode(session.nodeId), delegate)
    if (groups.length === 0)
      return

    root = document.createElement('div')
    root.className = 'ei-deep-edit-toolbar'
    applyStyle(root, materialToolbarShellStyle())

    for (const group of groups) {
      const groupEl = document.createElement('div')
      applyStyle(groupEl, materialToolbarGroupStyle())

      for (const action of group.actions) {
        const btn = document.createElement('button')
        btn.type = 'button'
        btn.title = action.label
        btn.disabled = Boolean(action.disabled)
        applyStyle(btn, materialToolbarButtonStyle(action.disabled, action.danger))
        appendIcon(btn, action.icon)
        btn.addEventListener('mouseenter', () => {
          if (!action.disabled)
            btn.style.background = action.danger ? 'rgba(217, 45, 32, 0.10)' : 'rgba(24, 144, 255, 0.10)'
        })
        btn.addEventListener('mouseleave', () => {
          btn.style.background = 'transparent'
        })
        btn.addEventListener('click', (event) => {
          event.preventDefault()
          event.stopPropagation()
          if (!action.disabled)
            session.dispatch({ kind: 'command', command: action.command })
        })
        groupEl.appendChild(btn)
      }

      root.appendChild(groupEl)
    }

    container.appendChild(root)
  }

  return {
    update(selection: TableCellPayload | null) {
      rebuild(selection)
    },
    destroy() {
      root?.remove()
      root = null
    },
  }
}
