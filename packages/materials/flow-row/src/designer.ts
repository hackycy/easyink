import type {
  BehaviorRegistration,
  DatasourceDropHandler,
  EditingSessionRef,
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
import type { FlowColumnDef } from './schema'
import { keyboardCursorMiddleware, selectionMiddleware, undoBoundaryMiddleware } from '@easyink/core'
import { createPointerGesture } from '@easyink/shared'
import { computed, defineComponent, h, onUnmounted, ref, watch } from 'vue'
import {
  computeFlowColumnRects,
  getFlowRowProps,
  inferCollectionPath,
  renderFlowRowsHtml,
} from './rendering'

const FLOW_COLUMN_SELECTION_TYPE = 'flow-row.column'
const FLOW_ROW_PLACEHOLDER_ROW_COUNT = 2

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
      const rect = computeFlowColumnRects(node).find(item => item.index === payload.index)
      return rect ? [{ x: node.x + rect.x, y: node.y + rect.y, width: rect.w, height: rect.h }] : []
    },
    hitTest(point, node) {
      const rect = computeFlowColumnRects(node).find(item =>
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
      const rect = computeFlowColumnRects(node).find(item => item.index === sel.payload.index)
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
        draft.props = { ...props, columns: props.columns }
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
          ctx.session.setMeta('editingColumn', { index: payload.index })
          return
        }
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
        ctx.session.setMeta('editingColumn', { index: payload.index })
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
            wrapMode: base?.wrapMode ?? 'inline',
            content: '',
          })
          draft.props = { ...props, columns: props.columns }
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
        ctx.session.setMeta('editingColumn', undefined)
        ctx.tx.run<MaterialNode>(ctx.node.id, (draft) => {
          const props = getFlowRowProps(draft)
          const column = props.columns[p.index]
          if (column) {
            column.content = p.text
            column.binding = undefined
          }
          draft.props = { ...props, columns: props.columns }
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
        }, {
          mergeKey: `flow-row:resize-column:${p.index}`,
          label: 'designer.history.resizeFlowRowColumn',
        })
        return
      }

      await next()
    },
  }
}

function createDatasourceDropHandler(context: MaterialExtensionContext): DatasourceDropHandler {
  return {
    onDragOver(_field, point, node) {
      const rect = computeFlowColumnRects(node).find(item =>
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
      const rect = computeFlowColumnRects(node).find(item =>
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
      let activeGesture: ReturnType<typeof createPointerGesture> | null = null

      watch(isEditingThis, (editing) => {
        if (!editing)
          return
        const column = getFlowRowProps(props.node).columns[payload.value.index]
        editText.value = column?.content ?? ''
      }, { immediate: true })

      function cleanupGesture() {
        activeGesture?.abort()
        activeGesture = null
      }

      onUnmounted(cleanupGesture)

      function commitEdit() {
        if (!isEditingThis.value)
          return
        props.session.dispatch({
          kind: 'command',
          command: 'flow-row.commit-column-text',
          payload: { index: payload.value.index, text: editText.value },
        })
      }

      function cancelEdit() {
        props.session.setMeta('editingColumn', undefined)
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

      function actionButton(label: string, command: string) {
        return h('button', {
          type: 'button',
          title: label,
          style: toolbarButtonStyle(),
          onPointerdown: (event: PointerEvent) => {
            event.preventDefault()
            event.stopPropagation()
          },
          onClick: (event: MouseEvent) => {
            event.preventDefault()
            event.stopPropagation()
            props.session.dispatch({ kind: 'command', command })
          },
        }, label)
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
            style: {
              position: 'absolute',
              left: `${r.x}${u}`,
              top: `${r.y + r.height + 4}${u}`,
              zIndex: 20,
              display: 'flex',
              gap: '4px',
              pointerEvents: 'auto',
              background: '#fff',
              border: '1px solid rgba(0,0,0,.12)',
              borderRadius: '4px',
              boxShadow: '0 2px 8px rgba(0,0,0,.12)',
              padding: '3px',
            },
          }, [
            actionButton(context.t('designer.flowRow.insertBefore'), 'flow-row.insert-before'),
            actionButton(context.t('designer.flowRow.insertAfter'), 'flow-row.insert-after'),
            actionButton(context.t('designer.flowRow.removeColumn'), 'flow-row.remove-column'),
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

function toolbarButtonStyle(): Record<string, string> {
  return {
    border: '0',
    background: 'transparent',
    color: 'var(--ei-text-color, #333)',
    fontSize: '12px',
    lineHeight: '18px',
    minWidth: '22px',
    height: '22px',
    padding: '0 6px',
    borderRadius: '3px',
    cursor: 'pointer',
  }
}

export function createFlowRowExtension(context: MaterialExtensionContext): MaterialDesignerExtension {
  const geometry = createColumnGeometry()
  const selectionType = createColumnSelectionType(context)

  return {
    renderContent(nodeSignal, container) {
      function render() {
        const node = nodeSignal.get()
        const props = getFlowRowProps(node)
        const model = {
          rows: [props.columns.map((column, index) => ({
            column,
            index,
            text: column.binding ? `{#${context.getBindingLabel(column.binding)}}` : (column.content ?? ''),
          }))],
        }
        container.innerHTML = renderFlowRowsHtml(node, model, context.getSchema().unit, {
          designer: true,
          placeholderRows: FLOW_ROW_PLACEHOLDER_ROW_COUNT,
        })
      }
      render()
      return nodeSignal.subscribe(render)
    },
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
