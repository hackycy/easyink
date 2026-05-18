import type {
  BehaviorRegistration,
  DatasourceDropHandler,
  EditingSessionRef,
  MaterialControlPolicy,
  MaterialDesignerExtension,
  MaterialExtensionContext,
  MaterialGeometry,
  Rect,
  Selection,
  SelectionType,
  SubPropertySchema,
  TransactionAPI,
} from '@easyink/core'
import type { BindingRef, MaterialNode } from '@easyink/schema'
import type { BindingDisplayFormat } from '@easyink/shared'
import type { FlowColumnLayoutRect } from './rendering'
import type { FlowColumnDef } from './schema'
import { keyboardCursorMiddleware, selectionMiddleware, undoBoundaryMiddleware } from '@easyink/core'
import {
  IconAlignBottom,
  IconAlignMiddle,
  IconAlignTop,
  IconChevronLeft,
  IconChevronRight,
  IconDelete,
  IconTextAlignCenter,
  IconTextAlignLeft,
  IconTextAlignRight,
} from '@easyink/icons/svg-strings'
import {
  createPointerGesture,
  materialToolbarButtonStyle,
  materialToolbarDockStyle,
  materialToolbarGroupStyle,
  materialToolbarIconStyle,
  materialToolbarShellStyle,
} from '@easyink/shared'
import { computed, defineComponent, h, onUnmounted, ref, watch } from 'vue'
import {
  computeFlowColumnRects,
  createFlowRowPlaceholderRows,
  getFlowRowProps,
  inferCollectionPath,
  measureFlowRows,
  renderFlowRowsHtml,
} from './rendering'

const FLOW_COLUMN_SELECTION_TYPE = 'flow-row.column'
const FLOW_ROW_PLACEHOLDER_ROW_COUNT = 1
const renderedLayoutCache = new Map<string, { signature: string, rects: FlowColumnLayoutRect[], height: number }>()

const RUNTIME_HEIGHT_CONTROL_POLICY: MaterialControlPolicy = {
  geometry: {
    height: { state: 'disabled', reason: 'designer.reason.runtimeHeight' },
  },
  resize: {
    height: { state: 'hidden', reason: 'designer.reason.runtimeHeight' },
  },
}

interface FlowColumnSelectionPayload {
  index: number
}

const WRAP_MODE_OPTIONS = [
  { label: 'designer.option.flowRowInline', value: 'inline' },
  { label: 'designer.option.flowRowBlock', value: 'block' },
]

const HORIZONTAL_ALIGN_OPTIONS = [
  { label: 'designer.option.alignLeft', value: 'left' },
  { label: 'designer.option.alignCenter', value: 'center' },
  { label: 'designer.option.alignRight', value: 'right' },
]

const VERTICAL_ALIGN_OPTIONS = [
  { label: 'designer.option.alignTop', value: 'top' },
  { label: 'designer.option.alignMiddle', value: 'middle' },
  { label: 'designer.option.alignBottom', value: 'bottom' },
]

function createDesignerRowModel(node: MaterialNode, getBindingLabel?: (binding: BindingRef) => string) {
  const props = getFlowRowProps(node)
  return {
    rows: [props.columns.map((column, index) => ({
      column,
      index,
      text: column.binding && getBindingLabel ? `{#${getBindingLabel(column.binding)}}` : (column.content ?? ''),
    }))],
  }
}

function measureDesignerHeight(node: MaterialNode): number {
  const model = createDesignerRowModel(node)
  const rows = [
    ...model.rows,
    ...createFlowRowPlaceholderRows(model.rows[0], FLOW_ROW_PLACEHOLDER_ROW_COUNT),
  ]
  return Math.max(1, measureFlowRows(node, { rows }))
}

function applyDesignerAutoHeight(node: MaterialNode): void {
  node.height = measureDesignerHeight(node)
}

function createLayoutSignature(node: MaterialNode): string {
  const props = getFlowRowProps(node)
  return JSON.stringify({
    width: node.width,
    columns: props.columns.map(column => ({
      ratio: column.ratio,
      wrapMode: column.wrapMode,
      textAlign: column.textAlign,
      verticalAlign: column.verticalAlign,
      content: column.content,
      binding: column.binding?.fieldPath,
      format: column.binding?.format,
    })),
    gap: props.gap,
    paddingX: props.paddingX,
    paddingY: props.paddingY,
    typography: props.typography,
  })
}

function getDesignerColumnRects(node: MaterialNode): FlowColumnLayoutRect[] {
  const cached = renderedLayoutCache.get(node.id)
  return cached?.signature === createLayoutSignature(node) ? cached.rects : computeFlowColumnRects(node)
}

function measureRenderedLayout(container: HTMLElement, node: MaterialNode): { rects: FlowColumnLayoutRect[], height: number } | null {
  const root = container.querySelector<HTMLElement>('[data-easyink-material="flow-row"]')
  if (!root)
    return null

  const rootBox = root.getBoundingClientRect()
  const scale = rootBox.width > 0 && node.width > 0 ? rootBox.width / node.width : 1
  if (!Number.isFinite(scale) || scale <= 0)
    return null

  const rects = new Map<number, FlowColumnLayoutRect>()
  for (const cell of Array.from(root.querySelectorAll<HTMLElement>('[data-flow-row-column]'))) {
    if (cell.closest('[data-flow-row-preview]'))
      continue
    const rawIndex = cell.dataset.flowRowColumn
    const index = rawIndex === undefined ? Number.NaN : Number(rawIndex)
    if (!Number.isFinite(index) || rects.has(index))
      continue
    const box = cell.getBoundingClientRect()
    rects.set(index, {
      index,
      x: (box.left - rootBox.left) / scale,
      y: (box.top - rootBox.top) / scale,
      w: box.width / scale,
      h: box.height / scale,
    })
  }

  let height = 0
  for (const child of Array.from(root.children)) {
    const box = (child as HTMLElement).getBoundingClientRect()
    height = Math.max(height, (box.bottom - rootBox.top) / scale)
  }

  return {
    rects: Array.from(rects.values()),
    height: Math.max(1, height),
  }
}

function createBinding(field: {
  sourceId: string
  sourceName?: string
  sourceTag?: string
  fieldPath: string
  fieldKey?: string
  fieldLabel?: string
  format?: BindingDisplayFormat
}): BindingRef {
  return {
    sourceId: field.sourceId,
    sourceName: field.sourceName,
    sourceTag: field.sourceTag,
    fieldPath: field.fieldPath,
    fieldKey: field.fieldKey,
    fieldLabel: field.fieldLabel,
    format: field.format,
  }
}

function getCollectionBindingForField(field: BindingRef): BindingRef | undefined {
  const parts = field.fieldPath.split('/').filter(Boolean)
  if (parts.length < 2)
    return undefined
  return {
    sourceId: field.sourceId,
    sourceName: field.sourceName,
    sourceTag: field.sourceTag,
    fieldPath: parts.slice(0, -1).join('/'),
    fieldLabel: parts.slice(0, -1).join('/'),
  }
}

function createColumnGeometry(): MaterialGeometry {
  return {
    getContentLayout(node) {
      return {
        contentBox: {
          x: node.x,
          y: node.y,
          width: node.width,
          height: node.height,
        },
      }
    },
    resolveLocation(selection, node) {
      if (selection.type !== FLOW_COLUMN_SELECTION_TYPE)
        return []
      const payload = selection.payload as FlowColumnSelectionPayload
      const rect = getDesignerColumnRects(node).find(item => item.index === payload.index)
      return rect ? [{ x: node.x + rect.x, y: node.y + rect.y, width: rect.w, height: rect.h }] : []
    },
    hitTest(point, node) {
      const rect = getDesignerColumnRects(node).find(item =>
        point.x >= item.x && point.x <= item.x + item.w && point.y >= item.y && point.y <= item.y + item.h,
      )
      if (!rect)
        return null
      return {
        type: FLOW_COLUMN_SELECTION_TYPE,
        nodeId: node.id,
        payload: { index: rect.index },
      }
    },
  }
}

function createColumnSelectionType(context: MaterialExtensionContext): SelectionType<FlowColumnSelectionPayload> {
  return {
    id: FLOW_COLUMN_SELECTION_TYPE,
    validate(payload): payload is FlowColumnSelectionPayload {
      return typeof payload === 'object' && payload !== null && typeof (payload as FlowColumnSelectionPayload).index === 'number'
    },
    resolveLocation(sel, node) {
      const rect = getDesignerColumnRects(node).find(item => item.index === sel.payload.index)
      return rect ? [{ x: node.x + rect.x, y: node.y + rect.y, width: rect.w, height: rect.h }] : []
    },
    getPropertySchema(sel, node) {
      return createColumnSubPropertySchema(sel, node, context)
    },
  }
}

function createColumnSubPropertySchema(
  sel: Selection<FlowColumnSelectionPayload>,
  node: MaterialNode,
  context: MaterialExtensionContext,
): SubPropertySchema {
  function getColumn(): FlowColumnDef | undefined {
    const current = context.getNode(sel.nodeId)
    const props = current ? getFlowRowProps(current) : getFlowRowProps(node)
    return props.columns[sel.payload.index]
  }

  return {
    title: context.t('designer.property.flowRowColumn'),
    schemas: [
      { key: 'content', label: 'designer.property.content', type: 'textarea', group: 'content' },
      { key: 'wrapMode', label: 'designer.property.wrapMode', type: 'enum', group: 'layout', enum: WRAP_MODE_OPTIONS },
      { key: 'ratio', label: 'designer.property.ratio', type: 'number', group: 'layout', min: 0.05, max: 10, step: 0.05 },
      { key: 'textAlign', label: 'designer.property.textAlign', type: 'enum', group: 'typography', enum: HORIZONTAL_ALIGN_OPTIONS },
      { key: 'verticalAlign', label: 'designer.property.verticalAlign', type: 'enum', group: 'typography', enum: VERTICAL_ALIGN_OPTIONS },
    ],
    read(key) {
      const column = getColumn()
      if (!column)
        return undefined
      return (column as unknown as Record<string, unknown>)[key]
    },
    write(key, value, tx: TransactionAPI) {
      tx.run<MaterialNode>(sel.nodeId, (draft) => {
        const props = getFlowRowProps(draft)
        const column = props.columns[sel.payload.index]
        if (!column)
          return
        if (key === 'content') {
          column.content = typeof value === 'string' ? value : String(value ?? '')
          column.binding = undefined
        }
        else if (key === 'wrapMode') {
          column.wrapMode = value === 'block' ? 'block' : 'inline'
        }
        else if (key === 'ratio') {
          const ratio = typeof value === 'number' ? value : Number(value)
          if (!Number.isNaN(ratio))
            column.ratio = Math.max(0.05, ratio)
        }
        else if (key === 'textAlign') {
          if (value === 'left' || value === 'center' || value === 'right')
            column.textAlign = value
        }
        else if (key === 'verticalAlign') {
          if (value === 'top' || value === 'middle' || value === 'bottom')
            column.verticalAlign = value
        }
        draft.props = { ...props, columns: props.columns }
        applyDesignerAutoHeight(draft)
      }, { label: 'designer.history.updateFlowRowColumn' })
    },
    get binding() {
      return getColumn()?.binding
    },
    clearBinding(tx: TransactionAPI) {
      tx.run<MaterialNode>(sel.nodeId, (draft) => {
        const props = getFlowRowProps(draft)
        const column = props.columns[sel.payload.index]
        if (column)
          column.binding = undefined
        draft.props = { ...props, columns: props.columns }
      }, { label: 'designer.history.clearBinding' })
    },
    updateBindingFormat(tx: TransactionAPI, format: BindingDisplayFormat | undefined) {
      tx.run<MaterialNode>(sel.nodeId, (draft) => {
        const props = getFlowRowProps(draft)
        const column = props.columns[sel.payload.index]
        if (column?.binding)
          column.binding.format = format
        draft.props = { ...props, columns: props.columns }
      }, { label: 'designer.history.updateFlowRowColumn' })
    },
  }
}

function createColumnKeyboardBehavior(): BehaviorRegistration {
  return {
    id: 'flow-row.column-keyboard',
    eventKinds: ['key-down', 'command'],
    selectionTypes: [FLOW_COLUMN_SELECTION_TYPE],
    priority: 10,
    middleware: async (ctx, next) => {
      if (!ctx.selection) {
        await next()
        return
      }

      const payload = ctx.selection.payload as FlowColumnSelectionPayload
      const props = getFlowRowProps(ctx.node)
      const columnCount = props.columns.length

      if (ctx.event.kind === 'command') {
        if (ctx.event.command === 'enter-edit') {
          ctx.session.setSelectionScopedMeta('editingColumn', { index: payload.index }, ctx.selection)
          return
        }
        await next()
        return
      }

      if (ctx.event.kind !== 'key-down') {
        await next()
        return
      }

      const event = ctx.event
      if (event.key === 'Tab' || event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        event.originalEvent.preventDefault()
        event.originalEvent.stopPropagation()
        const dir = event.key === 'ArrowLeft' || event.originalEvent.shiftKey ? -1 : 1
        const nextIndex = (payload.index + dir + columnCount) % columnCount
        ctx.selectionStore.set({
          type: FLOW_COLUMN_SELECTION_TYPE,
          nodeId: ctx.node.id,
          payload: { index: nextIndex },
        })
        return
      }

      if (event.key === 'Enter' || event.key === 'F2') {
        event.originalEvent.preventDefault()
        event.originalEvent.stopPropagation()
        ctx.session.setSelectionScopedMeta('editingColumn', { index: payload.index }, ctx.selection)
        return
      }

      if (event.key === 'Delete') {
        event.originalEvent.preventDefault()
        event.originalEvent.stopPropagation()
        ctx.tx.run<MaterialNode>(ctx.node.id, (draft) => {
          const draftProps = getFlowRowProps(draft)
          const column = draftProps.columns[payload.index]
          if (column) {
            column.content = ''
            column.binding = undefined
          }
          draft.props = { ...draftProps, columns: draftProps.columns }
          applyDesignerAutoHeight(draft)
        }, { label: 'designer.history.updateFlowRowColumn' })
        return
      }

      await next()
    },
  }
}

function createColumnCommandBehavior(): BehaviorRegistration {
  return {
    id: 'flow-row.column-command',
    eventKinds: ['command'],
    priority: 20,
    middleware: async (ctx, next) => {
      if (ctx.event.kind !== 'command') {
        await next()
        return
      }

      if (ctx.event.command === 'enter-edit' && !ctx.selection) {
        ctx.selectionStore.set({
          type: FLOW_COLUMN_SELECTION_TYPE,
          nodeId: ctx.node.id,
          payload: { index: 0 },
        })
        return
      }

      if (!ctx.selection || ctx.selection.type !== FLOW_COLUMN_SELECTION_TYPE) {
        await next()
        return
      }

      const payload = ctx.selection.payload as FlowColumnSelectionPayload
      const command = ctx.event.command

      if (command === 'flow-row.insert-before' || command === 'flow-row.insert-after') {
        const insertAfter = command === 'flow-row.insert-after'
        const insertIndex = insertAfter ? payload.index + 1 : payload.index
        ctx.tx.run<MaterialNode>(ctx.node.id, (draft) => {
          const props = getFlowRowProps(draft)
          const base = props.columns[payload.index] ?? props.columns[0]
          props.columns.splice(insertIndex, 0, {
            ratio: base?.ratio ?? 1,
            textAlign: base?.textAlign ?? 'left',
            verticalAlign: base?.verticalAlign ?? 'middle',
            wrapMode: base?.wrapMode ?? 'inline',
            content: '',
          })
          draft.props = { ...props, columns: props.columns }
          applyDesignerAutoHeight(draft)
        }, { label: 'designer.history.insertFlowRowColumn' })
        ctx.selectionStore.set({
          type: FLOW_COLUMN_SELECTION_TYPE,
          nodeId: ctx.node.id,
          payload: { index: insertIndex },
        })
        return
      }

      if (command === 'flow-row.remove-column') {
        const nextIndex = Math.max(0, payload.index - 1)
        ctx.tx.run<MaterialNode>(ctx.node.id, (draft) => {
          const props = getFlowRowProps(draft)
          if (props.columns.length <= 1)
            return
          props.columns.splice(payload.index, 1)
          draft.props = { ...props, columns: props.columns }
          applyDesignerAutoHeight(draft)
        }, { label: 'designer.history.removeFlowRowColumn' })
        ctx.selectionStore.set({
          type: FLOW_COLUMN_SELECTION_TYPE,
          nodeId: ctx.node.id,
          payload: { index: nextIndex },
        })
        return
      }

      if (command === 'flow-row.commit-column-text') {
        const p = ctx.event.payload as { index: number, text: string }
        ctx.session.clearMeta('editingColumn')
        ctx.tx.run<MaterialNode>(ctx.node.id, (draft) => {
          const props = getFlowRowProps(draft)
          const column = props.columns[p.index]
          if (column) {
            column.content = p.text
            column.binding = undefined
          }
          draft.props = { ...props, columns: props.columns }
          applyDesignerAutoHeight(draft)
        }, { label: 'designer.history.updateFlowRowColumn' })
        return
      }

      if (command === 'flow-row.resize-column') {
        const p = ctx.event.payload as { index: number, clientDeltaX: number }
        const docA = ctx.geometry.screenToDocument({ x: 0, y: 0 })
        const docB = ctx.geometry.screenToDocument({ x: p.clientDeltaX, y: 0 })
        const docDelta = docB.x - docA.x
        ctx.tx.run<MaterialNode>(ctx.node.id, (draft) => {
          const props = getFlowRowProps(draft)
          const column = props.columns[p.index]
          if (column)
            column.ratio = Math.max(0.05, column.ratio + docDelta / Math.max(1, draft.width))
          draft.props = { ...props, columns: props.columns }
          applyDesignerAutoHeight(draft)
        }, {
          mergeKey: `flow-row:resize-column:${p.index}`,
          label: 'designer.history.resizeFlowRowColumn',
        })
        return
      }

      if (
        command === 'flow-row.align-left'
        || command === 'flow-row.align-center'
        || command === 'flow-row.align-right'
        || command === 'flow-row.valign-top'
        || command === 'flow-row.valign-middle'
        || command === 'flow-row.valign-bottom'
      ) {
        ctx.tx.run<MaterialNode>(ctx.node.id, (draft) => {
          const props = getFlowRowProps(draft)
          const column = props.columns[payload.index]
          if (!column)
            return
          if (command === 'flow-row.align-left')
            column.textAlign = 'left'
          else if (command === 'flow-row.align-center')
            column.textAlign = 'center'
          else if (command === 'flow-row.align-right')
            column.textAlign = 'right'
          else if (command === 'flow-row.valign-top')
            column.verticalAlign = 'top'
          else if (command === 'flow-row.valign-middle')
            column.verticalAlign = 'middle'
          else if (command === 'flow-row.valign-bottom')
            column.verticalAlign = 'bottom'
          draft.props = { ...props, columns: props.columns }
          applyDesignerAutoHeight(draft)
        }, { label: 'designer.history.updateFlowRowColumn' })
        return
      }

      await next()
    },
  }
}

function createDatasourceDropHandler(context: MaterialExtensionContext): DatasourceDropHandler {
  return {
    onDragOver(_field, point, node) {
      const rect = getDesignerColumnRects(node).find(item =>
        point.x >= item.x && point.x <= item.x + item.w && point.y >= item.y && point.y <= item.y + item.h,
      )
      if (!rect)
        return null
      return {
        status: 'accepted',
        rect,
        label: context.t('designer.dataSource.bindColumn'),
      }
    },
    onDrop(field, point, node) {
      const rect = getDesignerColumnRects(node).find(item =>
        point.x >= item.x && point.x <= item.x + item.w && point.y >= item.y && point.y <= item.y + item.h,
      )
      if (!rect)
        return

      const binding = createBinding(field)
      context.tx.run<MaterialNode>(node.id, (draft) => {
        const props = getFlowRowProps(draft)
        const column = props.columns[rect.index]
        if (!column)
          return
        column.binding = binding
        column.content = ''
        if (!draft.binding) {
          const collectionBinding = getCollectionBindingForField(binding)
          if (collectionBinding)
            draft.binding = collectionBinding
        }
        draft.props = { ...props, columns: props.columns }
        applyDesignerAutoHeight(draft)
      }, { label: 'designer.history.bindField' })
    },
  }
}

function createColumnDecorationComponent(context: MaterialExtensionContext) {
  return defineComponent({
    name: 'FlowRowColumnDecoration',
    props: {
      rects: { type: Array as () => Rect[], required: true },
      selection: { type: Object as () => Selection, required: true },
      node: { type: Object as () => MaterialNode, required: true },
      session: { type: Object as () => EditingSessionRef, required: true },
      unit: { type: String, required: true },
    },
    setup(props) {
      const rect = computed(() => props.rects[0])
      const payload = computed(() => props.selection.payload as FlowColumnSelectionPayload)
      const editingColumn = computed(() => props.session.meta.editingColumn as { index: number } | undefined)
      const isEditingThis = computed(() => editingColumn.value?.index === payload.value.index)
      const editText = ref('')
      const activeEditTarget = ref<number | null>(null)
      let activeGesture: ReturnType<typeof createPointerGesture> | null = null

      watch(isEditingThis, (editing) => {
        if (!editing) {
          if (activeEditTarget.value !== null)
            commitEdit()
          return
        }
        const targetIndex = payload.value.index
        activeEditTarget.value = targetIndex
        const column = getFlowRowProps(props.node).columns[targetIndex]
        editText.value = column?.content ?? ''
      }, { immediate: true })

      function cleanupGesture() {
        activeGesture?.abort()
        activeGesture = null
      }

      onUnmounted(cleanupGesture)
      onUnmounted(() => {
        if (activeEditTarget.value !== null)
          commitEdit()
      })

      function commitEdit() {
        const targetIndex = activeEditTarget.value
        if (targetIndex === null)
          return
        activeEditTarget.value = null
        props.session.dispatch({
          kind: 'command',
          command: 'flow-row.commit-column-text',
          payload: { index: targetIndex, text: editText.value },
        })
      }

      function cancelEdit() {
        activeEditTarget.value = null
        props.session.clearMeta('editingColumn')
      }

      function onEditKeydown(event: KeyboardEvent) {
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault()
          commitEdit()
        }
        else if (event.key === 'Escape') {
          event.preventDefault()
          cancelEdit()
        }
        event.stopPropagation()
      }

      function actionButton(label: string, command: string, icon: string, options: { danger?: boolean, disabled?: boolean, active?: boolean } = {}) {
        const buttonStyle = materialToolbarButtonStyle(options.disabled, options.danger)
        if (options.active) {
          buttonStyle.background = 'rgba(24, 144, 255, 0.14)'
          buttonStyle.color = 'var(--ei-primary, #1890ff)'
        }
        return h('button', {
          type: 'button',
          title: label,
          disabled: options.disabled,
          style: buttonStyle,
          onPointerdown: (event: PointerEvent) => {
            event.preventDefault()
            event.stopPropagation()
          },
          onMouseenter: (event: MouseEvent) => {
            if (!options.disabled)
              (event.currentTarget as HTMLElement).style.background = options.danger ? 'rgba(217, 45, 32, 0.10)' : 'rgba(24, 144, 255, 0.10)'
          },
          onMouseleave: (event: MouseEvent) => {
            (event.currentTarget as HTMLElement).style.background = options.active ? 'rgba(24, 144, 255, 0.14)' : 'transparent'
          },
          onClick: (event: MouseEvent) => {
            event.preventDefault()
            event.stopPropagation()
            if (!options.disabled)
              props.session.dispatch({ kind: 'command', command })
          },
        }, [
          h('span', { innerHTML: icon, style: materialToolbarIconStyle() }),
        ])
      }

      function onResizePointerDown(event: PointerEvent) {
        event.preventDefault()
        event.stopPropagation()
        const target = event.currentTarget as HTMLElement
        let lastX = event.clientX
        activeGesture = createPointerGesture({
          target,
          event,
          onMove(moveEvent) {
            const delta = moveEvent.clientX - lastX
            lastX = moveEvent.clientX
            props.session.dispatch({
              kind: 'command',
              command: 'flow-row.resize-column',
              payload: { index: payload.value.index, clientDeltaX: delta },
            })
          },
          onEnd() {
            activeGesture = null
          },
        })
      }

      return () => {
        const r = rect.value
        if (!r)
          return null
        const u = props.unit
        const flowProps = getFlowRowProps(props.node)
        const currentColumn = flowProps.columns[payload.value.index]
        const canRemoveColumn = flowProps.columns.length > 1
        const children = [
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
          h('div', {
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
            },
            onPointerdown: onResizePointerDown,
          }),
          h('div', {
            class: 'ei-deep-edit-toolbar',
            style: {
              ...materialToolbarDockStyle(props.node, u),
            },
            onPointerdown: (event: PointerEvent) => {
              event.preventDefault()
              event.stopPropagation()
            },
            onClick: (event: MouseEvent) => {
              event.stopPropagation()
            },
          }, [
            h('div', { style: materialToolbarShellStyle() }, [
              h('div', { style: materialToolbarGroupStyle() }, [
                actionButton(context.t('designer.toolbar.alignLeft'), 'flow-row.align-left', IconTextAlignLeft, {
                  active: currentColumn?.textAlign === 'left',
                }),
                actionButton(context.t('designer.toolbar.alignCenter'), 'flow-row.align-center', IconTextAlignCenter, {
                  active: currentColumn?.textAlign === 'center',
                }),
                actionButton(context.t('designer.toolbar.alignRight'), 'flow-row.align-right', IconTextAlignRight, {
                  active: currentColumn?.textAlign === 'right',
                }),
              ]),
              h('div', { style: materialToolbarGroupStyle() }, [
                actionButton(context.t('designer.toolbar.alignTop'), 'flow-row.valign-top', IconAlignTop, {
                  active: currentColumn?.verticalAlign === 'top',
                }),
                actionButton(context.t('designer.toolbar.alignMiddle'), 'flow-row.valign-middle', IconAlignMiddle, {
                  active: (currentColumn?.verticalAlign ?? 'middle') === 'middle',
                }),
                actionButton(context.t('designer.toolbar.alignBottom'), 'flow-row.valign-bottom', IconAlignBottom, {
                  active: currentColumn?.verticalAlign === 'bottom',
                }),
              ]),
              h('div', { style: materialToolbarGroupStyle() }, [
                actionButton(context.t('designer.flowRow.insertBefore'), 'flow-row.insert-before', IconChevronLeft),
                actionButton(context.t('designer.flowRow.insertAfter'), 'flow-row.insert-after', IconChevronRight),
                actionButton(context.t('designer.flowRow.removeColumn'), 'flow-row.remove-column', IconDelete, {
                  danger: true,
                  disabled: !canRemoveColumn,
                }),
              ]),
            ]),
          ]),
        ]

        if (isEditingThis.value) {
          children.push(h('textarea', {
            ref: (el: unknown) => {
              if (el)
                (el as HTMLTextAreaElement).focus()
            },
            value: editText.value,
            onInput: (event: Event) => {
              editText.value = (event.target as HTMLTextAreaElement).value
            },
            onKeydown: onEditKeydown,
            onBlur: commitEdit,
            onPointerdown: (event: PointerEvent) => event.stopPropagation(),
            style: {
              position: 'absolute',
              left: `${r.x}${u}`,
              top: `${r.y}${u}`,
              width: `${r.width}${u}`,
              height: `${Math.max(r.height, 6)}${u}`,
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

export function createFlowRowExtension(context: MaterialExtensionContext): MaterialDesignerExtension {
  const geometry = createColumnGeometry()
  const selectionType = createColumnSelectionType(context)

  return {
    renderContent(nodeSignal, container) {
      let nodeId: string | null = null
      function render() {
        const node = nodeSignal.get()
        nodeId = node.id
        const model = createDesignerRowModel(node, context.getBindingLabel)
        container.innerHTML = renderFlowRowsHtml(node, model, context.getSchema().unit, {
          designer: true,
          placeholderRows: FLOW_ROW_PLACEHOLDER_ROW_COUNT,
        })
        const measured = measureRenderedLayout(container, node)
        const desiredHeight = measured?.height ?? measureDesignerHeight(node)
        if (measured) {
          renderedLayoutCache.set(node.id, {
            signature: createLayoutSignature(node),
            rects: measured.rects,
            height: desiredHeight,
          })
        }
        if (Math.abs(node.height - desiredHeight) > 0.1) {
          context.tx.run<MaterialNode>(node.id, (draft) => {
            draft.height = desiredHeight
          }, {
            mergeKey: `flow-row:auto-height:${node.id}`,
            label: 'designer.history.updateFlowRowHeight',
          })
        }
      }
      render()
      const unsubscribe = nodeSignal.subscribe(render)
      return () => {
        unsubscribe()
        if (nodeId)
          renderedLayoutCache.delete(nodeId)
      }
    },
    resolveControlPolicy: () => RUNTIME_HEIGHT_CONTROL_POLICY,
    geometry,
    selectionTypes: [selectionType as SelectionType<unknown>],
    behaviors: [
      selectionMiddleware(),
      undoBoundaryMiddleware({ groupBy: 'flow-row-column' }),
      createColumnKeyboardBehavior(),
      createColumnCommandBehavior(),
      keyboardCursorMiddleware(),
    ],
    decorations: [{
      selectionTypes: [FLOW_COLUMN_SELECTION_TYPE],
      component: createColumnDecorationComponent(context),
      layer: 'above-content',
    }],
    datasourceDrop: createDatasourceDropHandler(context),
  }
}

export function getFlowRowCollectionPath(node: MaterialNode): string | undefined {
  return inferCollectionPath(node, getFlowRowProps(node))
}

export { FLOW_COLUMN_SELECTION_TYPE }
