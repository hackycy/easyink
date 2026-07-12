import type { EditingSessionRef, Rect, Selection } from '@easyink/core'
import type { MaterialNode } from '@easyink/schema'
import type { TableCellPayload, TableEditingDelegate } from './types'
import {
  createPointerGesture,
  materialToolbarButtonStyle,
  materialToolbarDockStyle,
  materialToolbarGroupStyle,
  materialToolbarIconStyle,
  materialToolbarShellStyle,
} from '@easyink/shared'
import { computed, defineComponent, h, onUnmounted, ref, watch } from 'vue'
import { cellAt, isEditableTableNode, tableProjection } from './canonical'
import { createTableToolbarGroups } from './toolbar'

function isCellBound(node: MaterialNode<unknown> | null, row: number, col: number): boolean {
  const cell = node ? cellAt(node, row, col) : undefined
  return cell?.content.kind === 'text' && Boolean(cell.content.bindingPort)
}

/**
 * Create a TableCellDecoration component with the delegate captured in closure.
 * This allows toolbar and inline editing to access material-specific context
 * without requiring extra props beyond what the framework provides.
 */
export function createTableCellDecorationComponent(delegate: TableEditingDelegate) {
  return defineComponent({
    name: 'TableCellDecoration',
    props: {
      rects: { type: Array as () => Rect[], required: true },
      selection: { type: Object as () => Selection, required: true },
      node: { type: Object as () => MaterialNode, required: true },
      session: { type: Object as () => EditingSessionRef, required: true },
      unit: { type: String, required: true },
    },
    setup(props) {
      const rect = computed(() => props.rects[0])
      const payload = computed(() => props.selection.payload as TableCellPayload)

      const tableNode = computed(() => {
        if (!isEditableTableNode(props.node))
          return null
        return props.node
      })

      const colResizeVisible = computed(() => {
        const t = tableNode.value
        if (!t)
          return false
        const topology = tableProjection(t).topology
        const cell = topology.rows[payload.value.row]?.cells[payload.value.col]
        const cs = cell?.colSpan ?? 1
        const rightCol = payload.value.col + cs - 1
        if (delegate.canResizeColumn?.(t, rightCol) === false)
          return false
        return rightCol >= 0 && rightCol < topology.columns.length
      })

      const rowResizeVisible = computed(() => {
        const t = tableNode.value
        if (!t)
          return false
        const topology = tableProjection(t).topology
        const cell = topology.rows[payload.value.row]?.cells[payload.value.col]
        const rs = cell?.rowSpan ?? 1
        const bottomRow = payload.value.row + rs - 1
        if (delegate.canResizeRow?.(t, bottomRow) === false)
          return false
        return bottomRow >= 0 && bottomRow < topology.rows.length
      })

      const resizeMeta = computed(() => props.session.meta.resize as { active: boolean, handle: string, index: number } | undefined)

      // ─── Inline editing state (from session.meta) ──────────────

      const editingCell = computed(() => props.session.meta.editingCell as { row: number, col: number } | undefined)

      const isEditingThis = computed(() => {
        const ec = editingCell.value
        if (!ec)
          return false
        return ec.row === payload.value.row && ec.col === payload.value.col && !isCellBound(tableNode.value, payload.value.row, payload.value.col)
      })

      const editText = ref('')
      const editTextarea = ref<HTMLTextAreaElement | null>(null)
      const activeEditTarget = ref<TableCellPayload | null>(null)
      const disposeSelectionInvalidation = props.session.onSelectionInvalidated?.((event) => {
        if (event.reason === 'identity-changed')
          cancelEdit()
      })

      // When entering edit mode, initialize text from cell content
      watch(isEditingThis, (editing) => {
        if (editing) {
          const target = { row: payload.value.row, col: payload.value.col }
          activeEditTarget.value = target
          const t = tableNode.value
          if (t) {
            const cell = cellAt(t, target.row, target.col)
            editText.value = cell?.content.kind === 'text' ? cell.content.text : ''
          }
        }
        else if (activeEditTarget.value) {
          commitEdit()
        }
      }, { immediate: true })

      const toolbarGroups = computed(() => createTableToolbarGroups(payload.value, tableNode.value ?? undefined, delegate))

      onUnmounted(() => {
        disposeSelectionInvalidation?.()
        if (activeEditTarget.value)
          commitEdit()
      })

      // ─── Resize handlers ──────────────────────────────────────

      function getColIndex(): number {
        const t = tableNode.value
        if (!t)
          return -1
        const cell = tableProjection(t).topology.rows[payload.value.row]?.cells[payload.value.col]
        return payload.value.col + (cell?.colSpan ?? 1) - 1
      }

      function getRowIndex(): number {
        const t = tableNode.value
        if (!t)
          return -1
        const cell = tableProjection(t).topology.rows[payload.value.row]?.cells[payload.value.col]
        return payload.value.row + (cell?.rowSpan ?? 1) - 1
      }

      function onColResizePointerDown(e: PointerEvent) {
        e.stopPropagation()
        e.preventDefault()
        const colIndex = getColIndex()
        if (colIndex < 0)
          return

        props.session.setMeta('resize', { active: true, handle: 'col', index: colIndex })

        const el = e.currentTarget as HTMLElement
        let lastX = e.clientX

        // Use the shared gesture helper so pointercancel (system gesture
        // interruption, capture loss, device switch) tears down the
        // resize meta exactly like a normal pointerup. Without this the
        // session.meta.resize would stick on, leaving every subsequent
        // gesture filtered through a stale "resize active" flag — see
        // audit/202605011431.md item 3.
        createPointerGesture({
          target: el,
          event: e,
          onMove(ev) {
            const delta = ev.clientX - lastX
            lastX = ev.clientX
            props.session.dispatch({
              kind: 'command',
              command: 'resize-column',
              payload: { index: colIndex, delta, screenDelta: true },
            })
          },
          onEnd() {
            props.session.setMeta('resize', undefined)
          },
        })
      }

      function onRowResizePointerDown(e: PointerEvent) {
        e.stopPropagation()
        e.preventDefault()
        const rowIndex = getRowIndex()
        if (rowIndex < 0)
          return

        props.session.setMeta('resize', { active: true, handle: 'row', index: rowIndex })

        const el = e.currentTarget as HTMLElement
        let lastY = e.clientY

        createPointerGesture({
          target: el,
          event: e,
          onMove(ev) {
            const delta = ev.clientY - lastY
            lastY = ev.clientY
            props.session.dispatch({
              kind: 'command',
              command: 'resize-row',
              payload: { index: rowIndex, delta, screenDelta: true },
            })
          },
          onEnd() {
            props.session.setMeta('resize', undefined)
          },
        })
      }

      // ─── Inline edit handlers ─────────────────────────────────

      function commitEdit() {
        const target = activeEditTarget.value
        if (!target)
          return
        const text = editText.value
        activeEditTarget.value = null
        props.session.clearMeta('editingCell')
        props.session.dispatch({
          kind: 'command',
          command: 'commit-cell-text',
          payload: { row: target.row, col: target.col, text },
        })
      }

      function cancelEdit() {
        activeEditTarget.value = null
        editText.value = ''
        if (editTextarea.value)
          editTextarea.value.value = ''
        props.session.clearMeta('editingCell')
      }

      function onEditKeyDown(e: KeyboardEvent) {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault()
          commitEdit()
        }
        else if (e.key === 'Escape') {
          e.preventDefault()
          cancelEdit()
        }
        e.stopPropagation()
      }

      return () => {
        const r = rect.value
        if (!r)
          return null

        const u = props.unit
        const children = [
          // Cell highlight
          h('div', {
            style: {
              position: 'absolute',
              left: `${r.x}${u}`,
              top: `${r.y}${u}`,
              width: `${r.width}${u}`,
              height: `${r.height}${u}`,
              border: '2px solid var(--ei-primary, #1890ff)',
              background: 'rgba(24, 144, 255, 0.08)',
              pointerEvents: 'none',
              zIndex: 11,
              boxSizing: 'border-box',
            },
          }),
        ]

        // Column resize handle
        if (colResizeVisible.value) {
          children.push(h('div', {
            style: {
              position: 'absolute',
              left: `${r.x + r.width}${u}`,
              top: `${r.y}${u}`,
              width: '6px',
              height: `${r.height}${u}`,
              marginLeft: '-3px',
              cursor: 'col-resize',
              pointerEvents: 'auto',
              zIndex: 12,
              background: resizeMeta.value?.handle === 'col' ? 'rgba(24, 144, 255, 0.15)' : undefined,
            },
            onPointerdown: onColResizePointerDown,
            onMouseenter: (e: MouseEvent) => {
              (e.currentTarget as HTMLElement).style.background = 'rgba(24, 144, 255, 0.15)'
            },
            onMouseleave: (e: MouseEvent) => {
              if (resizeMeta.value?.handle !== 'col')
                (e.currentTarget as HTMLElement).style.background = ''
            },
          }))
        }

        // Row resize handle
        if (rowResizeVisible.value) {
          children.push(h('div', {
            style: {
              position: 'absolute',
              left: `${r.x}${u}`,
              top: `${r.y + r.height}${u}`,
              width: `${r.width}${u}`,
              height: '6px',
              marginTop: '-3px',
              cursor: 'row-resize',
              pointerEvents: 'auto',
              zIndex: 12,
              background: resizeMeta.value?.handle === 'row' ? 'rgba(24, 144, 255, 0.15)' : undefined,
            },
            onPointerdown: onRowResizePointerDown,
            onMouseenter: (e: MouseEvent) => {
              (e.currentTarget as HTMLElement).style.background = 'rgba(24, 144, 255, 0.15)'
            },
            onMouseleave: (e: MouseEvent) => {
              if (resizeMeta.value?.handle !== 'row')
                (e.currentTarget as HTMLElement).style.background = ''
            },
          }))

          const t = tableNode.value
          const row = t ? tableProjection(t).topology.rows[payload.value.row] : undefined
          const placeholderCount = delegate.getTableKind() === 'data'
            ? delegate.getPlaceholderRowCount()
            : 0
          if (row?.role === 'repeat-template' && placeholderCount > 0) {
            for (let extra = 1; extra <= placeholderCount; extra++) {
              children.push(h('div', {
                style: {
                  position: 'absolute',
                  left: `${r.x}${u}`,
                  top: `${r.y + r.height * (extra + 1)}${u}`,
                  width: `${r.width}${u}`,
                  height: '6px',
                  marginTop: '-3px',
                  cursor: 'row-resize',
                  pointerEvents: 'auto',
                  zIndex: 12,
                  background: resizeMeta.value?.handle === 'row' ? 'rgba(24, 144, 255, 0.15)' : undefined,
                },
                onPointerdown: onRowResizePointerDown,
                onMouseenter: (e: MouseEvent) => {
                  (e.currentTarget as HTMLElement).style.background = 'rgba(24, 144, 255, 0.15)'
                },
                onMouseleave: (e: MouseEvent) => {
                  if (resizeMeta.value?.handle !== 'row')
                    (e.currentTarget as HTMLElement).style.background = ''
                },
              }))
            }
          }
        }

        children.push(h('div', {
          class: 'ei-deep-edit-toolbar',
          style: materialToolbarDockStyle(props.node, u),
          onPointerdown: (event: PointerEvent) => {
            event.preventDefault()
            event.stopPropagation()
          },
          onClick: (event: MouseEvent) => {
            event.stopPropagation()
          },
        }, [
          h('div', { style: materialToolbarShellStyle() }, [
            ...toolbarGroups.value.map(group => h('div', {
              key: group.id,
              style: materialToolbarGroupStyle(),
            }, group.actions.map(action => h('button', {
              key: action.id,
              type: 'button',
              title: action.label,
              disabled: action.disabled,
              style: materialToolbarButtonStyle(action.disabled, action.danger),
              onMouseenter: (event: MouseEvent) => {
                if (!action.disabled)
                  (event.currentTarget as HTMLElement).style.background = action.danger ? 'rgba(217, 45, 32, 0.10)' : 'rgba(24, 144, 255, 0.10)'
              },
              onMouseleave: (event: MouseEvent) => {
                (event.currentTarget as HTMLElement).style.background = 'transparent'
              },
              onClick: (event: MouseEvent) => {
                event.preventDefault()
                event.stopPropagation()
                if (!action.disabled)
                  props.session.dispatch({ kind: 'command', command: action.command })
              },
            }, [
              h('span', { innerHTML: action.icon, style: materialToolbarIconStyle() }),
            ])))),
          ]),
        ]))

        // Inline edit textarea (when editing this cell)
        if (isEditingThis.value) {
          children.push(h('textarea', {
            ref: (el: unknown) => {
              editTextarea.value = el as HTMLTextAreaElement | null
              editTextarea.value?.focus()
            },
            value: editText.value,
            onInput: (e: Event) => {
              editText.value = (e.target as HTMLTextAreaElement).value
            },
            onKeydown: onEditKeyDown,
            onBlur: commitEdit,
            onPointerdown: (e: PointerEvent) => e.stopPropagation(),
            style: {
              position: 'absolute',
              left: `${r.x}${u}`,
              top: `${r.y}${u}`,
              width: `${r.width}${u}`,
              height: `${r.height}${u}`,
              boxSizing: 'border-box',
              border: '2px solid var(--ei-primary, #1890ff)',
              background: '#fff',
              padding: '2px 4px',
              fontSize: 'inherit',
              fontFamily: 'inherit',
              resize: 'none',
              outline: 'none',
              zIndex: 15,
              pointerEvents: 'auto',
            },
          }))
        }

        return children
      }
    },
  })
}
