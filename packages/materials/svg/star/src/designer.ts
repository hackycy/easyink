import type { BehaviorRegistration, EditingSessionRef, MaterialDesignerExtension, MaterialExtensionContext, MaterialGeometry, Rect, Selection, SelectionType, SubPropertySchema, TransactionAPI } from '@easyink/core'
import type { MaterialNode } from '@easyink/schema'
import type { SvgStarControlSelection, SvgStarProps } from './schema'
import { undoBoundaryMiddleware } from '@easyink/core'
import { getNodeProps } from '@easyink/schema'
import { createPointerGesture } from '@easyink/shared'
import { computed, defineComponent, h, onUnmounted } from 'vue'
import { buildStarSvgMarkup, getStarControlRect, getStarEditGuide, resolveStarControl, updateStarControlFromLocalPoint } from './rendering'

import { SVG_STAR_DEFAULTS } from './schema'

const STAR_CONTROL_SELECTION_TYPE = 'svg-star.control'

function createStarGeometry(): MaterialGeometry {
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
      if (selection.type !== STAR_CONTROL_SELECTION_TYPE)
        return []

      const props = {
        ...SVG_STAR_DEFAULTS,
        ...getNodeProps<SvgStarProps>(node),
      }
      return [getStarControlRect(node, props, selection.payload as SvgStarControlSelection)]
    },
    hitTest(point, node) {
      const props = {
        ...SVG_STAR_DEFAULTS,
        ...getNodeProps<SvgStarProps>(node),
      }
      const control = resolveStarControl(point, node, props)
      if (!control && !(point.x >= 0 && point.y >= 0 && point.x <= node.width && point.y <= node.height))
        return null

      return {
        type: STAR_CONTROL_SELECTION_TYPE,
        nodeId: node.id,
        payload: control ?? { handle: 'inner-radius', index: 0 },
      }
    },
  }
}

function createStarSelectionType(): SelectionType<SvgStarControlSelection> {
  return {
    id: STAR_CONTROL_SELECTION_TYPE,
    resolveLocation(sel, node) {
      const props = {
        ...SVG_STAR_DEFAULTS,
        ...getNodeProps<SvgStarProps>(node),
      }
      return [getStarControlRect(node, props, sel.payload)]
    },
    validate(payload): payload is SvgStarControlSelection {
      if (typeof payload !== 'object' || payload === null)
        return false
      const p = payload as SvgStarControlSelection
      return p.handle === 'inner-radius' && typeof p.index === 'number' && p.index >= 0
    },
    getPropertySchema(sel, node) {
      return createStarSubPropertySchema(sel, node)
    },
  }
}

function createStarSubPropertySchema(_selection: Selection<SvgStarControlSelection>, node: MaterialNode): SubPropertySchema {
  const schemas = [
    { key: 'starInnerRatio', label: 'materials.svgStar.property.innerRatio', type: 'number', group: 'shape', min: 0.08, max: 0.95, step: 0.01 },
  ]

  return {
    title: 'materials.svgStar.property.edit',
    schemas,
    read(key) {
      const props = {
        ...SVG_STAR_DEFAULTS,
        ...getNodeProps<SvgStarProps>(node),
      }
      if (key === 'starInnerRatio')
        return props.starInnerRatio
      return undefined
    },
    write(key, value, tx: TransactionAPI) {
      if (key !== 'starInnerRatio')
        return
      const numericValue = typeof value === 'number' ? value : Number(value)
      if (Number.isNaN(numericValue))
        return
      tx.run<MaterialNode>(node.id, (draft) => {
        const draftProps = draft.props ?? (draft.props = {})
        draftProps[key] = Math.min(0.95, Math.max(0.08, numericValue))
      }, {
        mergeKey: `svg-star:property:${key}`,
        label: 'materials.svgStar.history.update',
      })
    },
  }
}

function createStarHandleBehavior(): BehaviorRegistration {
  return {
    id: 'svg-star.handle-command',
    eventKinds: ['command'],
    middleware: async (ctx, next) => {
      if (ctx.event.kind !== 'command') {
        await next()
        return
      }

      if (ctx.event.command === 'svg-star.select-handle') {
        const payload = ctx.event.payload as SvgStarControlSelection
        ctx.selectionStore.set({
          type: STAR_CONTROL_SELECTION_TYPE,
          nodeId: ctx.node.id,
          payload: { handle: payload.handle, index: payload.index },
        })
        return
      }

      if (ctx.event.command === 'enter-edit') {
        if (!ctx.selection) {
          const currentProps = {
            ...SVG_STAR_DEFAULTS,
            ...getNodeProps<SvgStarProps>(ctx.node),
          }
          ctx.selectionStore.set({
            type: STAR_CONTROL_SELECTION_TYPE,
            nodeId: ctx.node.id,
            payload: { handle: 'inner-radius', index: 0 },
          })
          ctx.session.setMeta('starInnerRatio', currentProps.starInnerRatio)
        }
        return
      }

      if (ctx.event.command === 'svg-star.adjust-handle') {
        const payload = ctx.event.payload as { handle: SvgStarControlSelection['handle'], clientX: number, clientY: number }
        const documentPoint = ctx.geometry.screenToDocument({ x: payload.clientX, y: payload.clientY })
        const localPoint = ctx.geometry.documentToLocal(documentPoint, ctx.node)
        const currentProps = {
          ...SVG_STAR_DEFAULTS,
          ...getNodeProps<SvgStarProps>(ctx.node),
        }
        const nextProps = updateStarControlFromLocalPoint(ctx.node, currentProps, payload.handle, localPoint)
        ctx.tx.run<MaterialNode>(ctx.node.id, (draft) => {
          draft.props = {
            ...(draft.props ?? {}),
            ...nextProps,
          }
        }, {
          mergeKey: `svg-star:${payload.handle}`,
          label: 'materials.svgStar.history.update',
        })
        ctx.session.setMeta('starInnerRatio', nextProps.starInnerRatio)
        return
      }

      await next()
    },
  }
}

function createStarDecorationComponent(context: MaterialExtensionContext) {
  return defineComponent({
    name: 'SvgStarDecoration',
    props: {
      rects: { type: Array as () => Rect[], required: true },
      selection: { type: Object as () => Selection, required: true },
      node: { type: Object as () => MaterialNode, required: true },
      session: { type: Object as () => EditingSessionRef, required: true },
      unit: { type: String, required: true },
    },
    setup(props) {
      const currentSelection = computed(() => props.selection.payload as SvgStarControlSelection)
      const starProps = computed(() => {
        const nodeProps = getNodeProps<SvgStarProps>(props.node)
        const metaRatio = props.session.meta.starInnerRatio as number | undefined
        return {
          ...SVG_STAR_DEFAULTS,
          ...nodeProps,
          starInnerRatio: metaRatio ?? nodeProps.starInnerRatio ?? SVG_STAR_DEFAULTS.starInnerRatio,
        }
      })
      let activeGesture: ReturnType<typeof createPointerGesture> | null = null

      function onHandlePointerDown(handle: SvgStarControlSelection['handle'], index: number, event: PointerEvent) {
        event.stopPropagation()
        event.preventDefault()
        const target = event.currentTarget as HTMLElement
        if (!target)
          return

        props.session.dispatch({
          kind: 'command',
          command: 'svg-star.select-handle',
          payload: { handle, index },
        })

        activeGesture = createPointerGesture({
          target,
          event,
          onMove(moveEvent) {
            props.session.dispatch({
              kind: 'command',
              command: 'svg-star.adjust-handle',
              payload: {
                handle,
                clientX: moveEvent.clientX,
                clientY: moveEvent.clientY,
              },
            })
          },
          onEnd() {
            activeGesture = null
          },
        })
      }

      function cleanupGesture() {
        if (activeGesture) {
          activeGesture.abort()
          activeGesture = null
        }
      }

      onUnmounted(cleanupGesture)

      function renderHandle(handle: SvgStarControlSelection['handle'], index: number, label: string) {
        const sel = currentSelection.value
        const selected = sel.handle === handle && sel.index === index
        const guide = getStarEditGuide(starProps.value, props.node.width, props.node.height)
        const pos = guide.handles[index]

        return h('div', {
          style: {
            position: 'absolute',
            left: `calc(${pos.x}% - 4px)`,
            top: `calc(${pos.y}% - 4px)`,
            width: '8px',
            height: '8px',
            borderRadius: '999px',
            background: selected ? '#1890ff' : '#ffffff',
            border: '1.5px solid #1890ff',
            boxSizing: 'border-box',
            boxShadow: selected ? '0 0 0 3px rgba(24, 144, 255, 0.16)' : '0 1px 2px rgba(0, 0, 0, 0.16)',
            cursor: 'grab',
            pointerEvents: 'auto',
          },
          title: label,
          onPointerdown: (event: PointerEvent) => onHandlePointerDown(handle, index, event),
        })
      }

      return () => {
        const guide = getStarEditGuide(starProps.value, props.node.width, props.node.height)
        const overlays = []
        const baseStyle = {
          position: 'absolute',
          left: `${props.node.x}${props.unit}`,
          top: `${props.node.y}${props.unit}`,
          width: `${props.node.width}${props.unit}`,
          height: `${props.node.height}${props.unit}`,
          transform: `rotate(${props.node.rotation ?? 0}deg)`,
          transformOrigin: 'center center',
        } as const

        overlays.push(h('div', {
          style: {
            ...baseStyle,
            pointerEvents: 'none',
            zIndex: 6,
          },
        }, [h('div', {
          style: {
            position: 'absolute',
            inset: '0',
            pointerEvents: 'none',
          },
        }, guide.handles.map((_, index) =>
          renderHandle('inner-radius', index, `${context.t('materials.svgStar.property.innerRatio')} ${index + 1}`),
        ))]))

        return h('div', {}, overlays)
      }
    },
  })
}

export function createSvgStarExtension(context: MaterialExtensionContext): MaterialDesignerExtension {
  return {
    renderContent(nodeSignal, container) {
      function render() {
        const node = nodeSignal.get()
        const props = {
          ...SVG_STAR_DEFAULTS,
          ...getNodeProps<SvgStarProps>(node),
        }
        container.innerHTML = buildStarSvgMarkup(props, node.width, node.height)
      }

      render()
      return nodeSignal.subscribe(render)
    },
    geometry: createStarGeometry(),
    selectionTypes: [createStarSelectionType() as SelectionType<unknown>],
    behaviors: [
      undoBoundaryMiddleware({ groupBy: 'svg-star-control' }),
      createStarHandleBehavior(),
    ],
    decorations: [{
      selectionTypes: [STAR_CONTROL_SELECTION_TYPE],
      component: createStarDecorationComponent(context),
      layer: 'above-handles',
    }],
  }
}
