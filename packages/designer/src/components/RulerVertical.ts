import type { DesignerContext } from '../types'
import { toPixels } from '@easyink/core'
import { defineComponent, h, inject, onMounted, ref, watch } from 'vue'
import { DESIGNER_INJECTION_KEY } from '../types'

export const RulerVertical = defineComponent({
  name: 'RulerVertical',
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

      const unit = ctx.engine.schema.schema.page.unit
      const zoom = ctx.canvas.zoom.value
      const panY = ctx.canvas.panY.value

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
      const drawMinor = minorPx >= 3

      const offset = panY

      c.strokeStyle = '#999'
      c.fillStyle = '#666'
      c.font = '10px sans-serif'

      const startUnit = Math.floor(-offset / majorPx) * majorStep - majorStep
      const endUnit = startUnit + (height / majorPx + 2) * majorStep

      for (let val = startUnit; val <= endUnit; val += minorStep) {
        const px = toPixels(val, unit, 96, zoom) + offset
        if (px < 0 || px > height) {
          continue
        }

        const isMajor = Math.abs(val % majorStep) < 0.001

        c.beginPath()
        if (isMajor) {
          c.lineWidth = 1
          c.moveTo(width, px)
          c.lineTo(width * 0.3, px)
          c.stroke()
          // Rotated text
          c.save()
          c.translate(width * 0.2, px)
          c.rotate(-Math.PI / 2)
          c.textAlign = 'center'
          c.fillText(String(Math.round(val)), 0, 0)
          c.restore()
        }
        else if (drawMinor) {
          c.lineWidth = 0.5
          c.moveTo(width, px)
          c.lineTo(width * 0.6, px)
          c.stroke()
        }
      }

      // Right border
      c.strokeStyle = '#ddd'
      c.lineWidth = 1
      c.beginPath()
      c.moveTo(width - 0.5, 0)
      c.lineTo(width - 0.5, height)
      c.stroke()
    }

    onMounted(() => {
      draw()
    })

    watch(() => [
      ctx.canvas.zoom.value,
      ctx.canvas.panY.value,
      ctx.schema.value,
    ], () => {
      draw()
    })

    function onMousedown(e: MouseEvent): void {
      e.preventDefault()
      const startX = e.clientX

      function onMove(me: MouseEvent): void {
        void me
      }

      function onUp(me: MouseEvent): void {
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onUp)

        const deltaX = me.clientX - startX
        if (deltaX > 10) {
          const zoom = ctx.canvas.zoom.value
          const panX = ctx.canvas.panX.value
          const canvasEl = canvasRef.value
          if (!canvasEl) {
            return
          }
          const rect = canvasEl.getBoundingClientRect()
          const pageX = (me.clientX - rect.right - panX) / (96 / 25.4) / zoom
          if (pageX >= 0) {
            ctx.guides.addGuide('vertical', pageX)
          }
        }
      }

      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
    }

    return () => h('canvas', {
      class: 'easyink-ruler-v',
      onMousedown,
      ref: canvasRef,
      style: { cursor: 'col-resize', display: 'block', height: '100%', width: '100%' },
    })
  },
})
