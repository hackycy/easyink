<script setup lang="ts">
import { clamp } from '@easyink/shared'
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import { hexToHsva, hsvaToHex, hsvToRgb, isValidHex } from './color-utils'

const props = defineProps<{
  modelValue?: string
  label?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'commit': [value: string]
}>()

const PANEL_W = 220
const PANEL_H = 150
const BAR_H = 12

const DEFAULT_PRESETS = [
  '#000000',
  '#333333',
  '#666666',
  '#999999',
  '#cccccc',
  '#ffffff',
  '#ff0000',
  '#ff6600',
  '#ffcc00',
  '#33cc00',
  '#00cccc',
  '#0066ff',
  '#6633ff',
  '#cc00cc',
  '#ff3366',
  '#ff9999',
  '#ffcc99',
  '#ffff99',
  '#ccff99',
  '#99ffcc',
  '#99ccff',
  '#cc99ff',
  '#ff99cc',
  '#336699',
]

// state
const isOpen = ref(false)
const hue = ref(0)
const saturation = ref(100)
const brightness = ref(100)
const alpha = ref(1)
const hexInput = ref('')

// refs
const triggerRef = ref<HTMLElement | null>(null)
const popoverRef = ref<HTMLElement | null>(null)
const satCanvasRef = ref<HTMLCanvasElement | null>(null)
const hueCanvasRef = ref<HTMLCanvasElement | null>(null)
const alphaCanvasRef = ref<HTMLCanvasElement | null>(null)

const popoverPos = ref({ top: '0px', left: '0px' })

const MARGIN = 8
const POP_W = 244

function calcPopoverPos() {
  const trigger = triggerRef.value
  if (!trigger)
    return

  const rect = trigger.getBoundingClientRect()
  const popH = popoverRef.value?.offsetHeight ?? 360

  // vertical: prefer below, flip above when bottom space is insufficient
  const spaceBelow = window.innerHeight - rect.bottom - MARGIN
  const spaceAbove = rect.top - MARGIN
  let top: number
  if (spaceBelow >= popH || spaceBelow >= spaceAbove) {
    top = rect.bottom + 4
  }
  else {
    top = rect.top - 4 - popH
  }
  top = Math.max(MARGIN, Math.min(top, window.innerHeight - popH - MARGIN))

  // horizontal: align left with trigger, clamp within viewport
  let left = rect.left
  left = Math.min(left, window.innerWidth - POP_W - MARGIN)
  left = Math.max(MARGIN, left)

  popoverPos.value = { top: `${top}px`, left: `${left}px` }
}

// computed
const isEmpty = computed(() => !props.modelValue)

const fallbackHex = computed(() => props.modelValue || '#000000')

const currentHex = computed(() =>
  hsvaToHex({ h: hue.value, s: saturation.value, v: brightness.value, a: alpha.value }),
)

const alphaPercent = computed(() => Math.round(alpha.value * 100))

const currentRgbCss = computed(() => {
  const rgb = hsvToRgb({ h: hue.value, s: saturation.value, v: brightness.value })
  return `${rgb.r}, ${rgb.g}, ${rgb.b}`
})

const pureHueCss = computed(() => {
  const rgb = hsvToRgb({ h: hue.value, s: 100, v: 100 })
  return `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`
})

const satCursorStyle = computed(() => ({
  left: `${(saturation.value / 100) * PANEL_W}px`,
  top: `${(1 - brightness.value / 100) * PANEL_H}px`,
}))

const hueCursorStyle = computed(() => ({
  left: `${(hue.value / 360) * PANEL_W}px`,
}))

const alphaCursorStyle = computed(() => ({
  left: `${alpha.value * PANEL_W}px`,
}))

// helpers
function emitColor() {
  emit('update:modelValue', currentHex.value)
}

function commitColor() {
  emit('commit', currentHex.value)
}

function clearColor() {
  emit('update:modelValue', '')
  emit('commit', '')
}

function syncFromProp() {
  const hsva = hexToHsva(fallbackHex.value)
  hue.value = hsva.h
  saturation.value = hsva.s
  brightness.value = hsva.v
  alpha.value = hsva.a
  hexInput.value = currentHex.value.toUpperCase()
}

// popover
function toggleOpen() {
  isOpen.value = !isOpen.value
}

function onDocumentMouseDown(e: MouseEvent) {
  if (
    popoverRef.value
    && !popoverRef.value.contains(e.target as Node)
    && triggerRef.value
    && !triggerRef.value.contains(e.target as Node)
  ) {
    isOpen.value = false
  }
}

watch(isOpen, (open) => {
  if (open) {
    syncFromProp()
    nextTick(() => {
      calcPopoverPos()
      drawSatPanel()
      drawHueBar()
      drawAlphaBar()
      document.addEventListener('mousedown', onDocumentMouseDown, true)
    })
  }
  else {
    document.removeEventListener('mousedown', onDocumentMouseDown, true)
  }
})

onUnmounted(() => {
  document.removeEventListener('mousedown', onDocumentMouseDown, true)
})

// canvas drawing
function getDpr() {
  return window.devicePixelRatio || 1
}

function setupCanvas(canvas: HTMLCanvasElement, w: number, h: number): CanvasRenderingContext2D | null {
  const dpr = getDpr()
  canvas.width = w * dpr
  canvas.height = h * dpr
  canvas.style.width = `${w}px`
  canvas.style.height = `${h}px`
  const ctx = canvas.getContext('2d')
  if (ctx)
    ctx.scale(dpr, dpr)
  return ctx
}

function drawSatPanel() {
  const canvas = satCanvasRef.value
  if (!canvas)
    return
  const ctx = setupCanvas(canvas, PANEL_W, PANEL_H)
  if (!ctx)
    return

  // base hue
  ctx.fillStyle = pureHueCss.value
  ctx.fillRect(0, 0, PANEL_W, PANEL_H)

  // white gradient (left to right)
  const whiteGrad = ctx.createLinearGradient(0, 0, PANEL_W, 0)
  whiteGrad.addColorStop(0, 'rgba(255,255,255,1)')
  whiteGrad.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = whiteGrad
  ctx.fillRect(0, 0, PANEL_W, PANEL_H)

  // black gradient (top to bottom)
  const blackGrad = ctx.createLinearGradient(0, 0, 0, PANEL_H)
  blackGrad.addColorStop(0, 'rgba(0,0,0,0)')
  blackGrad.addColorStop(1, 'rgba(0,0,0,1)')
  ctx.fillStyle = blackGrad
  ctx.fillRect(0, 0, PANEL_W, PANEL_H)
}

function drawHueBar() {
  const canvas = hueCanvasRef.value
  if (!canvas)
    return
  const ctx = setupCanvas(canvas, PANEL_W, BAR_H)
  if (!ctx)
    return

  const grad = ctx.createLinearGradient(0, 0, PANEL_W, 0)
  grad.addColorStop(0, '#ff0000')
  grad.addColorStop(1 / 6, '#ffff00')
  grad.addColorStop(2 / 6, '#00ff00')
  grad.addColorStop(3 / 6, '#00ffff')
  grad.addColorStop(4 / 6, '#0000ff')
  grad.addColorStop(5 / 6, '#ff00ff')
  grad.addColorStop(1, '#ff0000')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, PANEL_W, BAR_H)
}

function drawAlphaBar() {
  const canvas = alphaCanvasRef.value
  if (!canvas)
    return
  const ctx = setupCanvas(canvas, PANEL_W, BAR_H)
  if (!ctx)
    return

  // checkerboard
  const size = 4
  for (let y = 0; y < BAR_H; y += size) {
    for (let x = 0; x < PANEL_W; x += size) {
      ctx.fillStyle = ((x / size + y / size) % 2 === 0) ? '#eee' : '#fff'
      ctx.fillRect(x, y, size, size)
    }
  }

  // color gradient
  const grad = ctx.createLinearGradient(0, 0, PANEL_W, 0)
  grad.addColorStop(0, `rgba(${currentRgbCss.value}, 0)`)
  grad.addColorStop(1, `rgba(${currentRgbCss.value}, 1)`)
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, PANEL_W, BAR_H)
}

// watchers for canvas redraw
let rafId = 0
function scheduleRedraw(fn: () => void) {
  if (rafId)
    cancelAnimationFrame(rafId)
  rafId = requestAnimationFrame(() => {
    rafId = 0
    fn()
  })
}

watch(hue, () => {
  if (!isOpen.value)
    return
  scheduleRedraw(() => {
    drawSatPanel()
    drawAlphaBar()
  })
})

watch([saturation, brightness], () => {
  if (!isOpen.value)
    return
  scheduleRedraw(() => {
    drawAlphaBar()
  })
})

// sync hexInput when HSVA changes
watch([hue, saturation, brightness, alpha], () => {
  hexInput.value = currentHex.value.toUpperCase()
})

// pointer handlers
function handleSatPointerDown(e: PointerEvent) {
  e.preventDefault()
  const canvas = satCanvasRef.value
  if (!canvas)
    return
  canvas.setPointerCapture(e.pointerId)

  const update = (ev: PointerEvent) => {
    const rect = canvas.getBoundingClientRect()
    const x = clamp(ev.clientX - rect.left, 0, rect.width)
    const y = clamp(ev.clientY - rect.top, 0, rect.height)
    saturation.value = (x / rect.width) * 100
    brightness.value = (1 - y / rect.height) * 100
  }

  update(e)
  emitColor()

  const onMove = (ev: PointerEvent) => {
    update(ev)
    emitColor()
  }
  const onUp = () => {
    canvas.removeEventListener('pointermove', onMove)
    canvas.removeEventListener('pointerup', onUp)
    commitColor()
  }

  canvas.addEventListener('pointermove', onMove)
  canvas.addEventListener('pointerup', onUp)
}

function handleHuePointerDown(e: PointerEvent) {
  e.preventDefault()
  const canvas = hueCanvasRef.value
  if (!canvas)
    return
  canvas.setPointerCapture(e.pointerId)

  const update = (ev: PointerEvent) => {
    const rect = canvas.getBoundingClientRect()
    const x = clamp(ev.clientX - rect.left, 0, rect.width)
    hue.value = (x / rect.width) * 360
  }

  update(e)
  emitColor()

  const onMove = (ev: PointerEvent) => {
    update(ev)
    emitColor()
  }
  const onUp = () => {
    canvas.removeEventListener('pointermove', onMove)
    canvas.removeEventListener('pointerup', onUp)
    commitColor()
  }

  canvas.addEventListener('pointermove', onMove)
  canvas.addEventListener('pointerup', onUp)
}

function handleAlphaPointerDown(e: PointerEvent) {
  e.preventDefault()
  const canvas = alphaCanvasRef.value
  if (!canvas)
    return
  canvas.setPointerCapture(e.pointerId)

  const update = (ev: PointerEvent) => {
    const rect = canvas.getBoundingClientRect()
    const x = clamp(ev.clientX - rect.left, 0, rect.width)
    alpha.value = x / rect.width
  }

  update(e)
  emitColor()

  const onMove = (ev: PointerEvent) => {
    update(ev)
    emitColor()
  }
  const onUp = () => {
    canvas.removeEventListener('pointermove', onMove)
    canvas.removeEventListener('pointerup', onUp)
    commitColor()
  }

  canvas.addEventListener('pointermove', onMove)
  canvas.addEventListener('pointerup', onUp)
}

// input handlers
function onHexInputCommit() {
  const val = hexInput.value.startsWith('#') ? hexInput.value : `#${hexInput.value}`
  if (isValidHex(val)) {
    const hsva = hexToHsva(val)
    hue.value = hsva.h
    saturation.value = hsva.s
    brightness.value = hsva.v
    // preserve current alpha when user only edits hex (6-digit)
    if (val.length <= 7)
      hsva.a = alpha.value
    else
      alpha.value = hsva.a
    emitColor()
    commitColor()
  }
  else {
    hexInput.value = currentHex.value.toUpperCase()
  }
}

function onAlphaInputCommit(e: Event) {
  const val = Number.parseInt((e.target as HTMLInputElement).value, 10)
  if (!Number.isNaN(val)) {
    alpha.value = clamp(val, 0, 100) / 100
    emitColor()
    commitColor()
  }
}

// preset click
function onPresetClick(color: string) {
  const hsva = hexToHsva(color)
  hue.value = hsva.h
  saturation.value = hsva.s
  brightness.value = hsva.v
  alpha.value = hsva.a
  emitColor()
  commitColor()
}

function isPresetActive(color: string): boolean {
  if (isEmpty.value)
    return false
  return currentHex.value.toLowerCase() === color.toLowerCase()
}

// watch external modelValue changes while closed
watch(() => props.modelValue, () => {
  if (!isOpen.value)
    syncFromProp()
})
</script>

<template>
  <div class="ei-color-picker-wrapper">
    <label v-if="label" class="ei-color-picker__label">{{ label }}</label>
    <div class="ei-color-picker">
      <button
        ref="triggerRef"
        class="ei-color-picker__trigger"
        @click="toggleOpen"
      >
        <span
          class="ei-color-picker__swatch"
          :class="{ 'ei-color-picker__swatch--empty': isEmpty }"
          :style="isEmpty ? {} : { '--swatch-color': modelValue }"
        />
        <span v-if="!isEmpty" class="ei-color-picker__value">{{ modelValue }}</span>
      </button>

      <div v-if="isOpen" ref="popoverRef" class="ei-color-picker__popover" :style="popoverPos">
        <!-- Saturation/Brightness panel -->
        <div class="ei-color-picker__sat-panel">
          <canvas
            ref="satCanvasRef"
            class="ei-color-picker__sat-canvas"
            @pointerdown="handleSatPointerDown"
          />
          <div class="ei-color-picker__sat-cursor" :style="satCursorStyle" />
        </div>

        <!-- Hue slider -->
        <div class="ei-color-picker__bar-wrap">
          <canvas
            ref="hueCanvasRef"
            class="ei-color-picker__bar-canvas"
            @pointerdown="handleHuePointerDown"
          />
          <div class="ei-color-picker__bar-handle" :style="hueCursorStyle" />
        </div>

        <!-- Alpha slider + preview -->
        <div class="ei-color-picker__alpha-row">
          <div class="ei-color-picker__bar-wrap ei-color-picker__alpha-bar">
            <canvas
              ref="alphaCanvasRef"
              class="ei-color-picker__bar-canvas"
              @pointerdown="handleAlphaPointerDown"
            />
            <div class="ei-color-picker__bar-handle" :style="alphaCursorStyle" />
          </div>
          <span
            class="ei-color-picker__preview"
            :style="{ '--preview-color': currentHex }"
          />
        </div>

        <!-- Inputs -->
        <div class="ei-color-picker__inputs">
          <div class="ei-color-picker__hex-wrap">
            <input
              v-model="hexInput"
              class="ei-color-picker__hex-input"
              maxlength="9"
              @keydown.enter="onHexInputCommit"
              @blur="onHexInputCommit"
            >
            <button
              class="ei-color-picker__clear-btn"
              title="清除颜色"
              @click="clearColor"
            >
              <svg width="10" height="10" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                <line x1="1.5" y1="1.5" x2="10.5" y2="10.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
                <line x1="10.5" y1="1.5" x2="1.5" y2="10.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
              </svg>
            </button>
          </div>
          <div class="ei-color-picker__alpha-input-wrap">
            <input
              class="ei-color-picker__alpha-input"
              type="number"
              :value="alphaPercent"
              min="0"
              max="100"
              @keydown.enter="onAlphaInputCommit"
              @blur="onAlphaInputCommit"
            >
            <span class="ei-color-picker__alpha-unit">%</span>
          </div>
        </div>

        <!-- Presets -->
        <div class="ei-color-picker__presets">
          <button
            v-for="color in DEFAULT_PRESETS"
            :key="color"
            class="ei-color-picker__preset"
            :class="{ 'ei-color-picker__preset--active': isPresetActive(color) }"
            :style="{ background: color }"
            @click="onPresetClick(color)"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ei-color-picker-wrapper {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.ei-color-picker__label {
  font-size: 12px;
  color: var(--ei-text-secondary, #666);
}

.ei-color-picker {
  position: relative;
}

.ei-color-picker__trigger {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0;
  border: none;
  background: none;
  cursor: pointer;
}

.ei-color-picker__swatch {
  display: block;
  width: 28px;
  height: 28px;
  border-radius: 4px;
  border: 1px solid var(--ei-border-color, #d0d0d0);
  background:
    linear-gradient(var(--swatch-color), var(--swatch-color)),
    conic-gradient(#eee 25%, #fff 25% 50%, #eee 50% 75%, #fff 75%) 0 0 / 8px 8px;
  flex-shrink: 0;
}

.ei-color-picker__swatch--empty {
  background: #fff;
  position: relative;
  overflow: hidden;
}

.ei-color-picker__swatch--empty::before {
  content: '';
  position: absolute;
  inset: -2px;
  background: linear-gradient(
    to bottom right,
    transparent calc(50% - 1px),
    #e53935 calc(50% - 1px),
    #e53935 calc(50% + 1px),
    transparent calc(50% + 1px)
  );
}

.ei-color-picker__value {
  font-size: 12px;
  color: var(--ei-text-secondary, #666);
  font-family: monospace;
}

.ei-color-picker__popover {
  position: fixed;
  z-index: 1000;
  padding: 12px;
  border: 1px solid var(--ei-border-color, #d0d0d0);
  border-radius: 6px;
  background: var(--ei-panel-bg, #fff);
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15);
  width: 244px;
  box-sizing: border-box;
}

/* Saturation panel */
.ei-color-picker__sat-panel {
  position: relative;
  width: 220px;
  height: 150px;
  border-radius: 4px;
  overflow: hidden;
  cursor: crosshair;
}

.ei-color-picker__sat-canvas {
  display: block;
  width: 220px;
  height: 150px;
}

.ei-color-picker__sat-cursor {
  position: absolute;
  width: 12px;
  height: 12px;
  border: 2px solid #fff;
  border-radius: 50%;
  box-shadow: 0 0 2px rgba(0, 0, 0, 0.6);
  pointer-events: none;
  transform: translate(-50%, -50%);
}

/* Bar shared */
.ei-color-picker__bar-wrap {
  position: relative;
  width: 220px;
  height: 12px;
  margin-top: 10px;
  border-radius: 6px;
  overflow: hidden;
  cursor: pointer;
}

.ei-color-picker__bar-canvas {
  display: block;
  width: 220px;
  height: 12px;
}

.ei-color-picker__bar-handle {
  position: absolute;
  top: 50%;
  width: 14px;
  height: 14px;
  border: 2px solid #fff;
  border-radius: 50%;
  box-shadow: 0 0 3px rgba(0, 0, 0, 0.4);
  pointer-events: none;
  transform: translate(-50%, -50%);
  background: transparent;
}

/* Alpha row */
.ei-color-picker__alpha-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ei-color-picker__alpha-bar {
  flex: 1;
}

.ei-color-picker__preview {
  display: block;
  width: 20px;
  height: 20px;
  border-radius: 3px;
  border: 1px solid var(--ei-border-color, #d0d0d0);
  margin-top: 10px;
  flex-shrink: 0;
  background:
    linear-gradient(var(--preview-color), var(--preview-color)),
    conic-gradient(#eee 25%, #fff 25% 50%, #eee 50% 75%, #fff 75%) 0 0 / 6px 6px;
}

/* Inputs */
.ei-color-picker__inputs {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 10px;
}

.ei-color-picker__hex-wrap {
  position: relative;
  flex: 1;
}

.ei-color-picker__hex-input {
  width: 100%;
  padding: 3px 22px 3px 6px;
  border: 1px solid var(--ei-border-color, #d0d0d0);
  border-radius: 4px;
  font-size: 12px;
  font-family: monospace;
  color: var(--ei-text, #333);
  background: var(--ei-input-bg, #fff);
  outline: none;
  box-sizing: border-box;
}

.ei-color-picker__hex-input:focus {
  border-color: var(--ei-primary, #1890ff);
}

.ei-color-picker__alpha-input-wrap {
  display: flex;
  align-items: center;
  width: 56px;
  border: 1px solid var(--ei-border-color, #d0d0d0);
  border-radius: 4px;
  background: var(--ei-input-bg, #fff);
  overflow: hidden;
}

.ei-color-picker__alpha-input {
  width: 36px;
  padding: 3px 2px 3px 6px;
  border: none;
  font-size: 12px;
  font-family: monospace;
  color: var(--ei-text, #333);
  background: transparent;
  outline: none;
  appearance: textfield;
  -moz-appearance: textfield;
  box-sizing: border-box;
}

.ei-color-picker__alpha-input::-webkit-inner-spin-button,
.ei-color-picker__alpha-input::-webkit-outer-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.ei-color-picker__alpha-unit {
  font-size: 12px;
  color: var(--ei-text-secondary, #999);
  padding-right: 4px;
}

/* Clear button */
.ei-color-picker__clear-btn {
  position: absolute;
  right: 4px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  padding: 0;
  border: none;
  border-radius: 3px;
  background: none;
  cursor: pointer;
  color: var(--ei-text-secondary, #bbb);
  transition: color 0.15s;
}

.ei-color-picker__clear-btn:hover {
  color: #ef3330;
}

/* Presets */
.ei-color-picker__presets {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 4px;
  margin-top: 10px;
}

.ei-color-picker__preset {
  width: 100%;
  aspect-ratio: 1;
  border: 1px solid var(--ei-border-color, #d0d0d0);
  border-radius: 3px;
  padding: 0;
  cursor: pointer;
}

.ei-color-picker__preset:hover {
  transform: scale(1.15);
}

.ei-color-picker__preset--active {
  border-color: var(--ei-primary, #1890ff);
  box-shadow: 0 0 0 1px var(--ei-primary, #1890ff);
}
</style>
