import type {
  BehaviorRegistration,
  MaterialDesignerExtension,
  MaterialExtensionContext,
  MaterialGeometry,
  Rect,
  Selection,
  SelectionDecorationDef,
  SelectionType,
} from '@easyink/core'
import type { MaterialNode } from '@easyink/schema'
import type { UnitType } from '@easyink/shared'
import type SignaturePad from 'signature_pad'
import type { SignaturePointGroup } from './schema'
import { UnitManager } from '@easyink/core'
import { IconClear, IconFilePen } from '@easyink/icons/svg-strings'
import {
  materialToolbarButtonStyle,
  materialToolbarDockStyle,
  materialToolbarGroupStyle,
  materialToolbarIconStyle,
  materialToolbarShellStyle,
} from '@easyink/shared'
import { defineComponent, h } from 'vue'
import { buildSignatureSvg } from './rendering'
import { getSignatureProps } from './schema'

const SIGNATURE_SELECTION_TYPE = 'signature.canvas'
const signatureOriginalRectKey: unique symbol = Symbol('easyink.signature.originalRect')

interface SignatureSelectionPayload {
  target: 'canvas'
}

type SignatureCanvasElement = HTMLCanvasElement & {
  [signatureOriginalRectKey]?: () => DOMRect
}

function isSignatureSelectionPayload(payload: unknown): payload is SignatureSelectionPayload {
  return typeof payload === 'object'
    && payload !== null
    && (payload as SignatureSelectionPayload).target === 'canvas'
}

function cloneSignatureData(data: SignaturePointGroup[]): SignaturePointGroup[] {
  return data.map(group => ({
    ...group,
    points: Array.isArray(group.points)
      ? group.points.map(point => ({ ...point }))
      : [],
  }))
}

function createSignatureGeometry(): MaterialGeometry {
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
      if (selection.type !== SIGNATURE_SELECTION_TYPE)
        return []
      return [{ x: node.x, y: node.y, width: node.width, height: node.height }]
    },
    hitTest(_point, node) {
      return {
        type: SIGNATURE_SELECTION_TYPE,
        nodeId: node.id,
        payload: { target: 'canvas' },
      }
    },
  }
}

function createSignatureSelectionType(): SelectionType {
  return {
    id: SIGNATURE_SELECTION_TYPE,
    validate: isSignatureSelectionPayload,
    resolveLocation(sel, node) {
      return isSignatureSelectionPayload(sel.payload) && sel.payload.target === 'canvas'
        ? [{ x: node.x, y: node.y, width: node.width, height: node.height }]
        : []
    },
  }
}

function createSignatureBehavior(context: MaterialExtensionContext): BehaviorRegistration {
  return {
    id: 'signature.canvas-select',
    eventKinds: ['pointer-down', 'command'],
    priority: 10,
    middleware: async (ctx, next) => {
      if (ctx.event.kind === 'pointer-down') {
        ctx.selectionStore.set({
          type: SIGNATURE_SELECTION_TYPE,
          nodeId: ctx.node.id,
          payload: { target: 'canvas' },
        })
        await next()
        return
      }

      if (ctx.event.kind === 'command') {
        if (ctx.event.command === 'signature.clear') {
          ctx.tx.run<MaterialNode>(ctx.node.id, (draft) => {
            const props = getSignatureProps(draft)
            draft.props = { ...props, data: [] }
          }, { label: 'materials.signature.history.clear' })
          ctx.session.setMeta('drawEnabled', false)
          context.emit('signature:draw-mode', { nodeId: ctx.node.id, enabled: false })
          return
        }

        if (ctx.event.command === 'signature.toggle-draw') {
          const enabled = ctx.session.meta.drawEnabled !== true
          ctx.session.setMeta('drawEnabled', enabled)
          context.emit('signature:draw-mode', { nodeId: ctx.node.id, enabled })
          return
        }
      }

      await next()
    },
  }
}

function toolbarButtonStyle(active?: boolean, disabled?: boolean): Record<string, string> {
  const style = materialToolbarButtonStyle(disabled)
  if (active) {
    style.background = 'var(--ei-primary-soft, rgba(24, 144, 255, 0.12))'
    style.color = 'var(--ei-primary, #1890ff)'
  }
  return style
}

function createSignatureDecorations(context: MaterialExtensionContext): SelectionDecorationDef[] {
  const LocalizedSignatureToolbar = defineComponent({
    name: 'EasyInkLocalizedSignatureToolbar',
    props: {
      rects: { type: Array as () => Rect[], required: true },
      selection: { type: Object as () => Selection<SignatureSelectionPayload>, required: true },
      node: { type: Object as () => MaterialNode, required: true },
      session: { type: Object, required: true },
      unit: { type: String, required: true },
    },
    setup(props) {
      return () => {
        if (props.rects.length === 0)
          return null

        const drawEnabled = (props.session as { meta?: Record<string, unknown> }).meta?.drawEnabled === true
        const session = props.session as { meta: Record<string, unknown>, dispatch: (event: { kind: 'command', command: string }) => void }
        return h('div', {
          class: 'ei-deep-edit-toolbar',
          style: materialToolbarDockStyle(props.node, props.unit),
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
              h('button', {
                type: 'button',
                title: context.t('materials.signature.action.clear'),
                style: toolbarButtonStyle(false),
                onClick: (event: MouseEvent) => {
                  event.preventDefault()
                  event.stopPropagation()
                  session.dispatch({ kind: 'command', command: 'signature.clear' })
                },
              }, [h('span', { innerHTML: IconClear, style: materialToolbarIconStyle() })]),
              h('button', {
                type: 'button',
                title: context.t('materials.signature.action.drawMode'),
                style: toolbarButtonStyle(drawEnabled),
                onClick: (event: MouseEvent) => {
                  event.preventDefault()
                  event.stopPropagation()
                  session.dispatch({ kind: 'command', command: 'signature.toggle-draw' })
                },
              }, [h('span', { innerHTML: IconFilePen, style: materialToolbarIconStyle() })]),
            ]),
          ]),
        ])
      }
    },
  })

  return [{
    selectionTypes: [SIGNATURE_SELECTION_TYPE],
    layer: 'above-handles',
    component: LocalizedSignatureToolbar,
  }]
}

function clearContainer(container: HTMLElement): void {
  while (container.firstChild)
    container.removeChild(container.firstChild)
}

function positiveFinite(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : fallback
}

function readCssPixelSize(value: string): number | undefined {
  if (!value.endsWith('px'))
    return undefined
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

function getSignatureCanvasVisualRect(canvas: HTMLCanvasElement): DOMRect {
  const originalRect = (canvas as SignatureCanvasElement)[signatureOriginalRectKey]
  return originalRect ? originalRect() : canvas.getBoundingClientRect()
}

function getSignatureCanvasLayoutPixelSize(canvas: HTMLCanvasElement, rect = getSignatureCanvasVisualRect(canvas)): { width: number, height: number } {
  const computed = window.getComputedStyle(canvas)
  const width = positiveFinite(
    canvas.clientWidth || canvas.offsetWidth || readCssPixelSize(computed.width),
    positiveFinite(rect.width, 1),
  )
  const height = positiveFinite(
    canvas.clientHeight || canvas.offsetHeight || readCssPixelSize(computed.height),
    positiveFinite(rect.height, 1),
  )
  return { width, height }
}

function createSignatureCanvasSizingKey(canvas: HTMLCanvasElement, node: MaterialNode): string {
  const ratio = Math.max(window.devicePixelRatio || 1, 1)
  const layoutSize = getSignatureCanvasLayoutPixelSize(canvas)
  return [
    Math.round(layoutSize.width * 1000) / 1000,
    Math.round(layoutSize.height * 1000) / 1000,
    node.width,
    node.height,
    ratio,
  ].join(':')
}

export function setSignatureCanvasSizeForDesigner(
  canvas: HTMLCanvasElement,
  contentSize?: { width: number, height: number },
): void {
  const ratio = Math.max(window.devicePixelRatio || 1, 1)
  const { width: layoutWidth, height: layoutHeight } = getSignatureCanvasLayoutPixelSize(canvas)
  const width = positiveFinite(contentSize?.width, layoutWidth)
  const height = positiveFinite(contentSize?.height, layoutHeight)
  const scaleX = layoutWidth / width
  const scaleY = layoutHeight / height

  canvas.width = Math.max(1, Math.round(layoutWidth * ratio))
  canvas.height = Math.max(1, Math.round(layoutHeight * ratio))
  canvas.style.width = '100%'
  canvas.style.height = '100%'

  const ctx = canvas.getContext('2d')
  if (ctx)
    ctx.setTransform(ratio * scaleX, 0, 0, ratio * scaleY, 0, 0)
}

function createDomRectLike(left: number, top: number, width: number, height: number): DOMRect {
  return {
    x: left,
    y: top,
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    toJSON: () => ({ x: left, y: top, left, top, width, height, right: left + width, bottom: top + height }),
  } as DOMRect
}

export function resolveSignatureCanvasLocalPoint(
  client: { x: number, y: number },
  visualRect: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>,
  layoutSize: { width: number, height: number },
  contentSize: { width: number, height: number },
  zoom: number,
): { x: number, y: number } {
  const safeZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1
  const width = positiveFinite(contentSize.width, layoutSize.width)
  const height = positiveFinite(contentSize.height, layoutSize.height)
  const scaleX = positiveFinite(layoutSize.width, width) / width
  const scaleY = positiveFinite(layoutSize.height, height) / height

  return {
    x: (client.x - visualRect.left) / safeZoom / scaleX,
    y: (client.y - visualRect.top) / safeZoom / scaleY,
  }
}

export function createSignaturePadRectForClientPoint(
  client: { x: number, y: number },
  visualRect: DOMRect,
  layoutSize: { width: number, height: number },
  contentSize: { width: number, height: number },
  zoom: number,
): DOMRect {
  const width = positiveFinite(contentSize.width, layoutSize.width)
  const height = positiveFinite(contentSize.height, layoutSize.height)
  const localPoint = resolveSignatureCanvasLocalPoint(client, visualRect, layoutSize, { width, height }, zoom)
  return createDomRectLike(
    client.x - localPoint.x,
    client.y - localPoint.y,
    width,
    height,
  )
}

export function signaturePadStrokeOptionsForUnit(unit: UnitType): { minWidth: number, maxWidth: number, minDistance: number } {
  const unitManager = new UnitManager(unit)
  return {
    minWidth: unitManager.fromPixels(0.5),
    maxWidth: unitManager.fromPixels(2.5),
    minDistance: unitManager.fromPixels(5),
  }
}

interface SignaturePadCoordinateAdapter {
  refresh: () => void
  dispose: () => void
}

function installSignaturePadCoordinateAdapter(
  canvas: HTMLCanvasElement,
  getNode: () => MaterialNode,
  getZoom: () => number,
): SignaturePadCoordinateAdapter {
  const originalGetBoundingClientRect = canvas.getBoundingClientRect.bind(canvas)
  ;(canvas as SignatureCanvasElement)[signatureOriginalRectKey] = originalGetBoundingClientRect
  let currentClientPoint: { x: number, y: number } | null = null
  let cachedVisualRect: DOMRect | null = null
  let cachedLayoutSize: { width: number, height: number } | null = null
  let cachedContentSize: { width: number, height: number } | null = null
  let cachedZoom = 1

  function normalizeZoom(zoom: number): number {
    return Number.isFinite(zoom) && zoom > 0 ? zoom : 1
  }

  function refreshMetrics(): void {
    const visualRect = originalGetBoundingClientRect()
    const node = getNode()
    cachedVisualRect = visualRect
    cachedLayoutSize = getSignatureCanvasLayoutPixelSize(canvas, visualRect)
    cachedContentSize = { width: node.width, height: node.height }
    cachedZoom = normalizeZoom(getZoom())
  }

  function getMetrics() {
    const node = getNode()
    const zoom = normalizeZoom(getZoom())
    if (
      !cachedVisualRect
      || !cachedLayoutSize
      || !cachedContentSize
      || cachedContentSize.width !== node.width
      || cachedContentSize.height !== node.height
      || cachedZoom !== zoom
    ) {
      refreshMetrics()
    }

    return {
      visualRect: cachedVisualRect!,
      layoutSize: cachedLayoutSize!,
      contentSize: cachedContentSize!,
      zoom: cachedZoom,
    }
  }

  function trackPoint(event: Event): void {
    if (typeof TouchEvent !== 'undefined' && event instanceof TouchEvent) {
      const touch = event.changedTouches[0] ?? event.touches[0]
      if (touch)
        currentClientPoint = { x: touch.clientX, y: touch.clientY }
      return
    }

    if (event instanceof MouseEvent)
      currentClientPoint = { x: event.clientX, y: event.clientY }
  }

  function trackStartPoint(event: Event): void {
    trackPoint(event)
    refreshMetrics()
  }

  canvas.getBoundingClientRect = () => {
    const metrics = getMetrics()
    if (!currentClientPoint)
      return metrics.visualRect

    return createSignaturePadRectForClientPoint(
      currentClientPoint,
      metrics.visualRect,
      metrics.layoutSize,
      metrics.contentSize,
      metrics.zoom,
    )
  }

  const windowTarget = canvas.ownerDocument.defaultView ?? window
  const capture = { capture: true, passive: true }
  canvas.addEventListener('pointerdown', trackStartPoint, capture)
  canvas.addEventListener('mousedown', trackStartPoint, capture)
  canvas.addEventListener('touchstart', trackStartPoint, capture)
  windowTarget.addEventListener('pointermove', trackPoint, capture)
  windowTarget.addEventListener('pointerup', trackPoint, capture)
  windowTarget.addEventListener('pointercancel', trackPoint, capture)
  windowTarget.addEventListener('mousemove', trackPoint, capture)
  windowTarget.addEventListener('mouseup', trackPoint, capture)
  windowTarget.addEventListener('touchmove', trackPoint, capture)
  windowTarget.addEventListener('touchend', trackPoint, capture)
  windowTarget.addEventListener('touchcancel', trackPoint, capture)

  refreshMetrics()

  return {
    refresh: refreshMetrics,
    dispose: () => {
      canvas.getBoundingClientRect = originalGetBoundingClientRect
      delete (canvas as SignatureCanvasElement)[signatureOriginalRectKey]
      canvas.removeEventListener('pointerdown', trackStartPoint, capture)
      canvas.removeEventListener('mousedown', trackStartPoint, capture)
      canvas.removeEventListener('touchstart', trackStartPoint, capture)
      windowTarget.removeEventListener('pointermove', trackPoint, capture)
      windowTarget.removeEventListener('pointerup', trackPoint, capture)
      windowTarget.removeEventListener('pointercancel', trackPoint, capture)
      windowTarget.removeEventListener('mousemove', trackPoint, capture)
      windowTarget.removeEventListener('mouseup', trackPoint, capture)
      windowTarget.removeEventListener('touchmove', trackPoint, capture)
      windowTarget.removeEventListener('touchend', trackPoint, capture)
      windowTarget.removeEventListener('touchcancel', trackPoint, capture)
    },
  }
}

async function loadSignaturePad(): Promise<typeof SignaturePad> {
  return (await import('signature_pad')).default
}

export function createSignatureExtension(context: MaterialExtensionContext): MaterialDesignerExtension {
  return {
    renderContent(nodeSignal, container) {
      let disposed = false
      let signaturePad: SignaturePad | null = null
      let canvas: HTMLCanvasElement | null = null
      let unsubscribeMode = () => {}
      let onBeginStroke: EventListener | null = null
      let onEndStroke: EventListener | null = null
      let resizeObserver: ResizeObserver | null = null
      let resizeFrame = 0
      let applying = false
      let drawingStroke = false
      let pendingResizeApply = false
      let lastSignature = ''
      let pendingOwnSignature = ''
      let drawEnabled = false
      let coordinateAdapter: SignaturePadCoordinateAdapter | null = null
      let lastCanvasSizingKey = ''

      function applyDrawMode(enabled: boolean): void {
        drawEnabled = enabled
        if (!signaturePad || !canvas)
          return

        if (drawEnabled) {
          signaturePad.on()
          canvas.style.pointerEvents = 'auto'
        }
        else {
          signaturePad.off()
          canvas.style.pointerEvents = 'none'
        }
      }

      function readonlySvg(node: MaterialNode): void {
        const props = getSignatureProps(node)
        container.innerHTML = buildSignatureSvg(props, node.width, node.height)
      }

      function applyNodeToPad(node: MaterialNode): void {
        if (!signaturePad || !canvas)
          return

        const props = getSignatureProps(node)
        setSignatureCanvasSizeForDesigner(canvas, { width: node.width, height: node.height })
        lastCanvasSizingKey = createSignatureCanvasSizingKey(canvas, node)
        coordinateAdapter?.refresh()
        signaturePad.backgroundColor = props.backgroundColor
        signaturePad.penColor = props.penColor
        signaturePad.clear()
        if (props.data.length > 0)
          signaturePad.fromData(cloneSignatureData(props.data))

        applyDrawMode(drawEnabled)
      }

      function scheduleApplyNodeToPad(): void {
        if (resizeFrame)
          cancelAnimationFrame(resizeFrame)
        resizeFrame = requestAnimationFrame(() => {
          resizeFrame = 0
          if (drawingStroke) {
            pendingResizeApply = true
            return
          }
          const node = nodeSignal.get()
          const nextSizingKey = canvas ? createSignatureCanvasSizingKey(canvas, node) : ''
          if (nextSizingKey === lastCanvasSizingKey) {
            coordinateAdapter?.refresh()
            return
          }
          applying = true
          applyNodeToPad(node)
          applying = false
          if (signaturePad)
            lastSignature = JSON.stringify(cloneSignatureData(signaturePad.toData() as SignaturePointGroup[]))
        })
      }

      function commitPadData(label = 'materials.signature.history.draw'): void {
        if (!signaturePad || applying)
          return

        const data = cloneSignatureData(signaturePad.toData() as SignaturePointGroup[])
        const signature = JSON.stringify(data)
        if (signature === lastSignature)
          return
        lastSignature = signature
        pendingOwnSignature = signature

        const node = nodeSignal.get()
        context.tx.run<MaterialNode>(node.id, (draft) => {
          const props = getSignatureProps(draft)
          draft.props = { ...props, data }
        }, { label, mergeKey: `${node.id}:signature-data`, mergeWindowMs: 1000 })
      }

      async function mountPad() {
        const SignaturePadCtor = await loadSignaturePad()
        if (disposed)
          return

        clearContainer(container)
        canvas = document.createElement('canvas')
        canvas.style.display = 'block'
        canvas.style.width = '100%'
        canvas.style.height = '100%'
        canvas.style.touchAction = 'none'
        canvas.style.userSelect = 'none'
        canvas.style.pointerEvents = 'none'
        container.appendChild(canvas)
        const node = nodeSignal.get()
        setSignatureCanvasSizeForDesigner(canvas, { width: node.width, height: node.height })
        lastCanvasSizingKey = createSignatureCanvasSizingKey(canvas, node)
        coordinateAdapter = installSignaturePadCoordinateAdapter(
          canvas,
          () => nodeSignal.get(),
          () => context.getZoom(),
        )

        const props = getSignatureProps(node)
        const strokeOptions = signaturePadStrokeOptionsForUnit(context.getSchema().unit)
        signaturePad = new SignaturePadCtor(canvas, {
          backgroundColor: props.backgroundColor,
          penColor: props.penColor,
          minWidth: strokeOptions.minWidth,
          maxWidth: strokeOptions.maxWidth,
          minDistance: strokeOptions.minDistance,
        })
        signaturePad.off()
        onBeginStroke = () => {
          drawingStroke = true
        }
        onEndStroke = () => {
          drawingStroke = false
          commitPadData()
          if (pendingResizeApply) {
            pendingResizeApply = false
            scheduleApplyNodeToPad()
          }
        }
        signaturePad.addEventListener('beginStroke', onBeginStroke)
        signaturePad.addEventListener('endStroke', onEndStroke)
        if (typeof ResizeObserver !== 'undefined') {
          resizeObserver = new ResizeObserver(scheduleApplyNodeToPad)
          resizeObserver.observe(canvas)
        }

        applyNodeToPad(node)
        if (signaturePad)
          lastSignature = JSON.stringify(cloneSignatureData(signaturePad.toData() as SignaturePointGroup[]))
      }

      function handleGlobalPointerDown(event: PointerEvent): void {
        if (!drawEnabled)
          return
        if (event.target instanceof Node && container.contains(event.target))
          return
        applyDrawMode(false)
      }

      function handleGlobalKeyDown(event: KeyboardEvent): void {
        if (event.key === 'Escape')
          applyDrawMode(false)
      }

      readonlySvg(nodeSignal.get())
      void mountPad()
      document.addEventListener('pointerdown', handleGlobalPointerDown, true)
      document.addEventListener('keydown', handleGlobalKeyDown, true)

      const unsubscribe = nodeSignal.subscribe((node) => {
        if (!signaturePad) {
          readonlySvg(node)
          return
        }
        const props = getSignatureProps(node)
        const nodeSignature = JSON.stringify(cloneSignatureData(props.data))
        if (pendingOwnSignature && nodeSignature === pendingOwnSignature) {
          pendingOwnSignature = ''
          lastSignature = nodeSignature
          coordinateAdapter?.refresh()
          return
        }
        applying = true
        applyNodeToPad(node)
        applying = false
        lastSignature = JSON.stringify(cloneSignatureData(signaturePad.toData() as SignaturePointGroup[]))
      })

      unsubscribeMode = context.on('signature:draw-mode', (payload) => {
        const event = payload as { nodeId?: string, enabled?: boolean }
        if (event.nodeId !== nodeSignal.get().id)
          return
        applyDrawMode(event.enabled === true)
      })

      return () => {
        disposed = true
        unsubscribe?.()
        unsubscribeMode()
        if (onBeginStroke)
          signaturePad?.removeEventListener('beginStroke', onBeginStroke)
        if (onEndStroke)
          signaturePad?.removeEventListener('endStroke', onEndStroke)
        resizeObserver?.disconnect()
        if (resizeFrame)
          cancelAnimationFrame(resizeFrame)
        document.removeEventListener('pointerdown', handleGlobalPointerDown, true)
        document.removeEventListener('keydown', handleGlobalKeyDown, true)
        coordinateAdapter?.dispose()
        coordinateAdapter = null
        signaturePad?.off()
        signaturePad = null
        clearContainer(container)
      }
    },
    geometry: createSignatureGeometry(),
    selectionTypes: [createSignatureSelectionType()],
    behaviors: [createSignatureBehavior(context)],
    decorations: createSignatureDecorations(context),
  }
}
