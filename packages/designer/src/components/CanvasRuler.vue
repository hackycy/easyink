<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useDesignerStore } from '../composables'
import { UnitManager } from '@easyink/core'

const props = defineProps<{
  cursorPos?: { x: number, y: number } | null
}>()

const store = useDesignerStore()

const RULER_SIZE = 20
const TICK_MIN_PX = 50
const BG_COLOR = '#f5f5f5'
const TEXT_COLOR = '#999'
const TICK_COLOR = '#ccc'
const BORDER_COLOR = '#ddd'
const CURSOR_COLOR = '#1890ff'
const RULER_OFFSET = RULER_SIZE
const DRAG_THRESHOLD = 3

const rootRef = ref<HTMLElement | null>(null)
const horizontalRef = ref<HTMLCanvasElement | null>(null)
const verticalRef = ref<HTMLCanvasElement | null>(null)

const zoom = computed(() => store.workbench.viewport.zoom)
const scrollLeft = computed(() => store.workbench.viewport.scrollLeft)
const scrollTop = computed(() => store.workbench.viewport.scrollTop)
const unit = computed(() => store.schema.unit)
const pageWidth = computed(() => store.schema.page.width)
const pageHeight = computed(() => store.schema.page.height)

function getTickStep(unitPerPx: number): number {
  const raw = TICK_MIN_PX * unitPerPx
  const magnitudes = [0.1, 0.25, 0.5, 1, 2, 5, 10, 20, 25, 50, 100, 200, 500, 1000]
  for (const m of magnitudes) {
    if (m >= raw)
      return m
  }
  return Math.ceil(raw / 100) * 100
}

function getOriginPx(direction: 'horizontal' | 'vertical'): number {
  const isH = direction === 'horizontal'
  // .ei-canvas-scroll has padding: 40px 40px 40px 60px (top right bottom left)
  const padding = isH ? 60 : 40
  const scroll = isH ? scrollLeft.value : scrollTop.value
  return padding - scroll
}

function drawRuler(canvas: HTMLCanvasElement, direction: 'horizontal' | 'vertical') {
  const ctx = canvas.getContext('2d')
  if (!ctx)
    return

  const dpr = window.devicePixelRatio || 1
  const isH = direction === 'horizontal'

  const rect = canvas.getBoundingClientRect()
  const length = Math.round(isH ? rect.width : rect.height)
  const thickness = RULER_SIZE

  if (length <= 0)
    return

  canvas.width = (isH ? length : thickness) * dpr
  canvas.height = (isH ? thickness : length) * dpr
  ctx.scale(dpr, dpr)

  // Background
  ctx.fillStyle = BG_COLOR
  ctx.fillRect(0, 0, isH ? length : thickness, isH ? thickness : length)

  const unitManager = new UnitManager(unit.value)
  const pxPerUnit = unitManager.toPixels(1, 96, zoom.value)
  if (pxPerUnit <= 0)
    return

  const unitPerPx = 1 / pxPerUnit
  const step = getTickStep(unitPerPx)
  const originPx = getOriginPx(direction)

  // Calculate visible range in document units
  const startUnit = Math.max(0, -originPx * unitPerPx)
  const endUnit = (length - originPx) * unitPerPx
  const firstTick = Math.floor(startUnit / step) * step

  ctx.fillStyle = TEXT_COLOR
  ctx.strokeStyle = TICK_COLOR
  ctx.lineWidth = 0.5
  ctx.font = '9px sans-serif'
  ctx.textBaseline = isH ? 'top' : 'middle'

  for (let v = firstTick; v <= endUnit + step; v += step) {
    const px = Math.round(originPx + v * pxPerUnit)
    if (px < 0)
      continue
    if (px > length)
      break

    if (isH) {
      ctx.beginPath()
      ctx.moveTo(px, thickness)
      ctx.lineTo(px, thickness * 0.35)
      ctx.stroke()
      ctx.fillText(String(Math.round(v * 100) / 100), px + 2, 2)
    }
    else {
      ctx.beginPath()
      ctx.moveTo(thickness, px)
      ctx.lineTo(thickness * 0.35, px)
      ctx.stroke()
      ctx.save()
      ctx.translate(9, px + 3)
      ctx.rotate(-Math.PI / 2)
      ctx.fillText(String(Math.round(v * 100) / 100), 0, 0)
      ctx.restore()
    }

    // Sub-ticks (5 divisions)
    const subStep = step / 5
    const subPxStep = subStep * pxPerUnit
    if (subPxStep >= 4) {
      for (let s = 1; s < 5; s++) {
        const subPx = Math.round(originPx + (v + s * subStep) * pxPerUnit)
        if (subPx < 0)
          continue
        if (subPx > length)
          break
        if (isH) {
          ctx.beginPath()
          ctx.moveTo(subPx, thickness)
          ctx.lineTo(subPx, thickness * 0.65)
          ctx.stroke()
        }
        else {
          ctx.beginPath()
          ctx.moveTo(thickness, subPx)
          ctx.lineTo(thickness * 0.65, subPx)
          ctx.stroke()
        }
      }
    }
  }

  // Border line
  ctx.strokeStyle = BORDER_COLOR
  ctx.lineWidth = 1
  if (isH) {
    ctx.beginPath()
    ctx.moveTo(0, thickness - 0.5)
    ctx.lineTo(length, thickness - 0.5)
    ctx.stroke()
  }
  else {
    ctx.beginPath()
    ctx.moveTo(thickness - 0.5, 0)
    ctx.lineTo(thickness - 0.5, length)
    ctx.stroke()
  }

  // Cursor position indicator
  if (props.cursorPos) {
    const cursorPx = isH
      ? props.cursorPos.x - RULER_OFFSET
      : props.cursorPos.y - RULER_OFFSET

    if (cursorPx >= 0 && cursorPx <= length) {
      ctx.strokeStyle = CURSOR_COLOR
      ctx.lineWidth = 1
      if (isH) {
        ctx.beginPath()
        ctx.moveTo(cursorPx, 0)
        ctx.lineTo(cursorPx, thickness)
        ctx.stroke()
      }
      else {
        ctx.beginPath()
        ctx.moveTo(0, cursorPx)
        ctx.lineTo(thickness, cursorPx)
        ctx.stroke()
      }
    }
  }
}

function redraw() {
  if (horizontalRef.value)
    drawRuler(horizontalRef.value, 'horizontal')
  if (verticalRef.value)
    drawRuler(verticalRef.value, 'vertical')
}

watch([zoom, unit, pageWidth, pageHeight, scrollLeft, scrollTop, () => props.cursorPos], redraw)

let resizeObserver: ResizeObserver | null = null

onMounted(() => {
  requestAnimationFrame(redraw)
  resizeObserver = new ResizeObserver(() => {
    requestAnimationFrame(redraw)
  })
  if (rootRef.value)
    resizeObserver.observe(rootRef.value)
})

onUnmounted(() => {
  resizeObserver?.disconnect()
})

defineExpose({ redraw })

const emit = defineEmits<{
  'guide-drag-start': [direction: 'x' | 'y', e: PointerEvent]
  'guide-create': [axis: 'x' | 'y', position: number]
  'ruler-hover': [hover: { axis: 'x' | 'y', position: number } | null]
}>()

/**
 * Compute the document-unit position at a screen coordinate on a ruler.
 */
function rulerPxToDocUnit(rulerDir: 'horizontal' | 'vertical', clientX: number, clientY: number): number | null {
  const isH = rulerDir === 'horizontal'
  const canvas = isH ? horizontalRef.value : verticalRef.value
  if (!canvas)
    return null
  const unitManager = new UnitManager(unit.value)
  const pxPerUnit = unitManager.toPixels(1, 96, zoom.value)
  if (pxPerUnit <= 0)
    return null
  const originPx = getOriginPx(rulerDir)
  const rect = canvas.getBoundingClientRect()
  const localPx = isH ? (clientX - rect.left) : (clientY - rect.top)
  return Math.round(((localPx - originPx) / pxPerUnit) * 100) / 100
}

/**
 * Handle pointerdown on a ruler canvas.
 * Distinguishes click (create guide at position) from drag (start drag flow).
 */
function handleRulerPointerDown(rulerDir: 'horizontal' | 'vertical', e: PointerEvent) {
  e.preventDefault()
  const isH = rulerDir === 'horizontal'
  const canvas = isH ? horizontalRef.value : verticalRef.value
  if (!canvas)
    return

  canvas.setPointerCapture(e.pointerId)

  const startX = e.clientX
  const startY = e.clientY
  let dragStarted = false

  function onMove(ev: PointerEvent) {
    if (dragStarted)
      return
    const dx = ev.clientX - startX
    const dy = ev.clientY - startY
    if (Math.abs(dx) + Math.abs(dy) >= DRAG_THRESHOLD) {
      dragStarted = true
      cleanup()
      // Drag: horizontal ruler drags to create horizontal guide ('y'),
      // vertical ruler drags to create vertical guide ('x')
      emit('guide-drag-start', isH ? 'y' : 'x', e)
    }
  }

  function onUp(ev: PointerEvent) {
    cleanup()
    if (dragStarted)
      return
    // Click: horizontal ruler creates vertical guide ('x'),
    // vertical ruler creates horizontal guide ('y')
    const position = rulerPxToDocUnit(rulerDir, ev.clientX, ev.clientY)
    if (position != null && position >= 0) {
      emit('guide-create', isH ? 'x' : 'y', position)
    }
  }

  function cleanup() {
    canvas!.removeEventListener('pointermove', onMove)
    canvas!.removeEventListener('pointerup', onUp)
  }

  canvas.addEventListener('pointermove', onMove)
  canvas.addEventListener('pointerup', onUp)
}

function handleRulerHover(direction: 'horizontal' | 'vertical', e: MouseEvent) {
  const isH = direction === 'horizontal'
  const position = rulerPxToDocUnit(direction, e.clientX, e.clientY)
  if (position == null)
    return
  // Horizontal ruler measures X coordinates -> vertical preview line (axis='x')
  // Vertical ruler measures Y coordinates -> horizontal preview line (axis='y')
  emit('ruler-hover', { axis: isH ? 'x' : 'y', position })
}

function handleRulerLeave() {
  emit('ruler-hover', null)
}
</script>

<template>
  <div ref="rootRef" class="ei-canvas-rulers">
    <div class="ei-ruler-corner" />
    <canvas
      ref="horizontalRef"
      class="ei-ruler ei-ruler--horizontal"
      :height="RULER_SIZE"
      @pointerdown="handleRulerPointerDown('horizontal', $event)"
      @mousemove="handleRulerHover('horizontal', $event)"
      @mouseleave="handleRulerLeave"
    />
    <canvas
      ref="verticalRef"
      class="ei-ruler ei-ruler--vertical"
      :width="RULER_SIZE"
      @pointerdown="handleRulerPointerDown('vertical', $event)"
      @mousemove="handleRulerHover('vertical', $event)"
      @mouseleave="handleRulerLeave"
    />
  </div>
</template>

<style scoped>
.ei-canvas-rulers {
  pointer-events: none;
  position: absolute;
  inset: 0;
  z-index: 100;
  overflow: hidden;
}

.ei-ruler-corner {
  pointer-events: auto;
  position: absolute;
  top: 0;
  left: 0;
  width: 20px;
  height: 20px;
  background: #f5f5f5;
  border-right: 1px solid #ddd;
  border-bottom: 1px solid #ddd;
  z-index: 1;
}

.ei-ruler {
  pointer-events: auto;
  position: absolute;
  display: block;
}

.ei-ruler--horizontal {
  top: 0;
  left: 20px;
  right: 0;
  height: 20px;
  width: calc(100% - 20px);
}

.ei-ruler--vertical {
  top: 20px;
  left: 0;
  bottom: 0;
  width: 20px;
  height: calc(100% - 20px);
}
</style>
