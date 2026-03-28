import type { DesignerContext } from '../types'
import { toPixels } from '@easyink/core'
import { defineComponent, h, inject, onMounted, ref, watch } from 'vue'
import { DESIGNER_INJECTION_KEY } from '../types'

export const RulerHorizontal = defineComponent({
  name: 'RulerHorizontal',
  setup() {
    const ctx = inject(DESIGNER_INJECTION_KEY) as DesignerContext
    const canvasRef = ref<HTMLCanvasElement | null>(null)

    function draw(): void {
      const canvas = canvasRef.value
      if (!canvas) {
        return
      }
      const c = canvas.getContext('2d')
      if (!c) {
        return
      }

      const rect = canvas.getBoundingClientRect()
      canvas.width = rect.width * devicePixelRatio
      canvas.height = rect.height * devicePixelRatio
      c.scale(devicePixelRatio, devicePixelRatio)

      const width = rect.width
      const height = rect.height

      c.clearRect(0, 0, width, height)
      c.fillStyle = 'var(--easyink-ruler-bg, #f5f5f5)'
      c.fillRect(0, 0, width, height)

      const unit = ctx.engine.schema.schema.page.unit
      const zoom = ctx.canvas.zoom.value
      const panX = ctx.canvas.panX.value

      // Calculate tick spacing based on unit
      let majorStep: number
      let minorStep: number
      if (unit === 'inch') {
        majorStep = 1
        minorStep = 0.125
      }
      else if (unit === 'pt') {
        majorStep = 72
        minorStep = 10
      }
      else {
        majorStep = 10
        minorStep = 1
      }

      const majorPx = toPixels(majorStep, unit, 96, zoom)
      const minorPx = toPixels(minorStep, unit, 96, zoom)

      // Don't draw minor ticks if too dense
      const drawMinor = minorPx >= 3

      const offset = panX

      c.strokeStyle = '#999'
      c.fillStyle = '#666'
      c.font = '10px sans-serif'
      c.textAlign = 'center'

      // Draw ticks
      const startUnit = Math.floor(-offset / majorPx) * majorStep - majorStep
      const endUnit = startUnit + (width / majorPx + 2) * majorStep

      for (let val = startUnit; val <= endUnit; val += minorStep) {
        const px = toPixels(val, unit, 96, zoom) + offset
        if (px < 0 || px > width) {
          continue
        }

        const isMajor = Math.abs(val % majorStep) < 0.001

        c.beginPath()
        if (isMajor) {
          c.lineWidth = 1
          c.moveTo(px, height)
          c.lineTo(px, height * 0.3)
          c.stroke()
          c.fillText(String(Math.round(val)), px, height * 0.25)
        }
        else if (drawMinor) {
          c.lineWidth = 0.5
          c.moveTo(px, height)
          c.lineTo(px, height * 0.6)
          c.stroke()
        }
      }

      // Bottom border
      c.strokeStyle = '#ddd'
      c.lineWidth = 1
      c.beginPath()
      c.moveTo(0, height - 0.5)
      c.lineTo(width, height - 0.5)
      c.stroke()
    }

    onMounted(() => {
      draw()
    })

    watch(() => [
      ctx.canvas.zoom.value,
      ctx.canvas.panX.value,
      ctx.schema.value,
    ], () => {
      draw()
    })

    function onMousedown(e: MouseEvent): void {
      e.preventDefault()
      // Start dragging a new horizontal guide
      const startY = e.clientY

      function onMove(me: MouseEvent): void {
        // Visual feedback could be added here
        void me
      }

      function onUp(me: MouseEvent): void {
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onUp)

        const deltaY = me.clientY - startY
        if (deltaY > 10) {
          // Dragged downward into canvas - create horizontal guide
          const zoom = ctx.canvas.zoom.value
          const panY = ctx.canvas.panY.value
          // Convert mouse Y to page units
          const canvasEl = canvasRef.value
          if (!canvasEl) {
            return
          }
          const rect = canvasEl.getBoundingClientRect()
          const pageY = (me.clientY - rect.bottom - panY) / (96 / 25.4) / zoom
          if (pageY >= 0) {
            ctx.guides.addGuide('horizontal', pageY)
          }
        }
      }

      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
    }

    return () => h('canvas', {
      class: 'easyink-ruler-h',
      onMousedown,
      ref: canvasRef,
      style: { cursor: 'row-resize', display: 'block', height: '100%', width: '100%' },
    })
  },
})
