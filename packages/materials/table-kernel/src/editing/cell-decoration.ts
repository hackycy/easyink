import type { EditingSessionRef, Rect, Selection } from '@easyink/core'
import type { MaterialNode, TableNode } from '@easyink/schema'
import type { TableCellPayload, TableEditingDelegate } from './types'
import { isTableNode } from '@easyink/schema'
import { computed, defineComponent, h, onMounted, onUnmounted, ref, watch } from 'vue'
import { createTableToolbar } from './toolbar'

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
        if (!isTableNode(props.node))
          return null
        return props.node as TableNode
      })

      const colResizeVisible = computed(() => {
        const t = tableNode.value
        if (!t)
          return false
        const cell = t.table.topology.rows[payload.value.row]?.cells[payload.value.col]
        const cs = cell?.colSpan ?? 1
        const rightCol = payload.value.col + cs - 1
        return rightCol < t.table.topology.columns.length - 1
      })

      const rowResizeVisible = computed(() => {
        const t = tableNode.value
        if (!t)
          return false
        const cell = t.table.topology.rows[payload.value.row]?.cells[payload.value.col]
        const rs = cell?.rowSpan ?? 1
        const bottomRow = payload.value.row + rs - 1
        return bottomRow < t.table.topology.rows.length - 1
      })

      const resizeMeta = computed(() => props.session.meta.resize as { active: boolean, handle: string, index: number } | undefined)

      // ─── Inline editing state (from session.meta) ──────────────

      const editingCell = computed(() => props.session.meta.editingCell as { row: number, col: number } | undefined)

      const isEditingThis = computed(() => {
        const ec = editingCell.value
        if (!ec)
          return false
        return ec.row === payload.value.row && ec.col === payload.value.col
      })

      const editText = ref('')

      // When entering edit mode, initialize text from cell content
      watch(isEditingThis, (editing) => {
        if (editing) {
          const t = tableNode.value
          if (t) {
            const cell = t.table.topology.rows[payload.value.row]?.cells[payload.value.col]
            editText.value = cell?.content?.text ?? ''
          }
        }
      }, { immediate: true })

      // ─── Toolbar management ─────────────────────────────────────

      const toolbarContainerRef = ref<HTMLDivElement | null>(null)
      let toolbar: ReturnType<typeof createTableToolbar> | null = null

      function mountToolbar() {
        if (toolbarContainerRef.value && !toolbar) {
          toolbar = createTableToolbar(props.session, toolbarContainerRef.value, delegate)
          toolbar.update(payload.value)
        }
      }

      onMounted(mountToolbar)

      watch(payload, (p) => {
        toolbar?.update(p)
      })

      watch(toolbarContainerRef, () => {
        toolbar?.destroy()
        toolbar = null
        mountToolbar()
      })

      onUnmounted(() => {
        toolbar?.destroy()
        toolbar = null
      })

      // ─── Resize handlers ──────────────────────────────────────

      function getColIndex(): number {
        const t = tableNode.value
        if (!t)
          return -1
        const cell = t.table.topology.rows[payload.value.row]?.cells[payload.value.col]
        return payload.value.col + (cell?.colSpan ?? 1) - 1
      }

      function getRowIndex(): number {
        const t = tableNode.value
        if (!t)
          return -1
        const cell = t.table.topology.rows[payload.value.row]?.cells[payload.value.col]
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
        el.setPointerCapture(e.pointerId)

        let lastX = e.clientX

        function onMove(ev: PointerEvent) {
          const delta = ev.clientX - lastX
          lastX = ev.clientX
          props.session.dispatch({
            kind: 'command',
            command: 'resize-column',
            payload: { index: colIndex, delta, screenDelta: true },
          })
        }

        function onUp(ev: PointerEvent) {
          el.releasePointerCapture(ev.pointerId)
          el.removeEventListener('pointermove', onMove)
          el.removeEventListener('pointerup', onUp)
          props.session.setMeta('resize', undefined)
        }

        el.addEventListener('pointermove', onMove)
        el.addEventListener('pointerup', onUp)
      }

      function onRowResizePointerDown(e: PointerEvent) {
        e.stopPropagation()
        e.preventDefault()
        const rowIndex = getRowIndex()
        if (rowIndex < 0)
          return

        props.session.setMeta('resize', { active: true, handle: 'row', index: rowIndex })

        const el = e.currentTarget as HTMLElement
        el.setPointerCapture(e.pointerId)

        let lastY = e.clientY

        function onMove(ev: PointerEvent) {
          const delta = ev.clientY - lastY
          lastY = ev.clientY
          props.session.dispatch({
            kind: 'command',
            command: 'resize-row',
            payload: { index: rowIndex, delta, screenDelta: true },
          })
        }

        function onUp(ev: PointerEvent) {
          el.releasePointerCapture(ev.pointerId)
          el.removeEventListener('pointermove', onMove)
          el.removeEventListener('pointerup', onUp)
          props.session.setMeta('resize', undefined)
        }

        el.addEventListener('pointermove', onMove)
        el.addEventListener('pointerup', onUp)
      }

      // ─── Inline edit handlers ─────────────────────────────────

      function commitEdit() {
        if (!isEditingThis.value)
          return
        const text = editText.value
        props.session.setMeta('editingCell', undefined)
        props.session.dispatch({
          kind: 'command',
          command: 'commit-cell-text',
          payload: { row: payload.value.row, col: payload.value.col, text },
        })
      }

      function cancelEdit() {
        props.session.setMeta('editingCell', undefined)
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
        }

        // Toolbar container (positioned below cell)
        children.push(h('div', {
          ref: (el: unknown) => { toolbarContainerRef.value = el as HTMLDivElement },
          style: {
            position: 'absolute',
            left: `${r.x}${u}`,
            top: `${r.y + r.height + 4}${u}`,
            zIndex: 20,
            pointerEvents: 'auto',
          },
        }))

        // Inline edit textarea (when editing this cell)
        if (isEditingThis.value) {
          children.push(h('textarea', {
            ref: (el: unknown) => {
              if (el) {
                (el as HTMLTextAreaElement).focus()
              }
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
