import type { DesignerContext } from '../types'
import { fromPixels, toPixels } from '@easyink/core'
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
      c.font = '9px sans-serif'
      c.textAlign = 'center'
      c.textBaseline = 'top'

      // Draw ticks
      const startUnit = Math.floor(-offset / majorPx) * majorStep - majorStep
      const endUnit = startUnit + (width / majorPx + 2) * majorStep

      // Skip labels when too dense: ensure at least ~40px between labels
      const labelEvery = majorPx >= 40 ? 1 : Math.ceil(40 / majorPx)

      for (let val = startUnit; val <= endUnit; val += minorStep) {
        const px = toPixels(val, unit, 96, zoom) + offset
        if (px < 0 || px > width) {
          continue
        }

        const isMajor = Math.abs(val % majorStep) < 0.001

        c.beginPath()
        if (isMajor) {
          const majorIndex = Math.round(val / majorStep)
          const showLabel = majorIndex % labelEvery === 0
          c.lineWidth = 1
          c.moveTo(px, height)
          c.lineTo(px, height * 0.4)
          c.stroke()
          if (showLabel) {
            c.fillText(String(Math.round(val)), px, 1)
          }
        }
        else if (drawMinor) {
          c.lineWidth = 0.5
          c.moveTo(px, height)
          c.lineTo(px, height * 0.65)
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

    function getPageX(clientX: number): number {
      const canvas = canvasRef.value
      if (!canvas) {
        return 0
      }
      const rect = canvas.getBoundingClientRect()
      const unit = ctx.engine.schema.schema.page.unit
      const zoom = ctx.canvas.zoom.value
      const panX = ctx.canvas.panX.value
      return fromPixels(clientX - rect.left - panX, unit, 96, zoom)
    }

    function onMousemove(e: MouseEvent): void {
      const pageX = getPageX(e.clientX)
      ctx.guides.setPreview({ orientation: 'vertical', position: pageX })
    }

    function onMouseleave(): void {
      ctx.guides.clearPreview()
    }

    function onClick(e: MouseEvent): void {
      const pageX = getPageX(e.clientX)
      ctx.guides.addGuide('vertical', pageX)
    }

    return () => h('canvas', {
      class: 'easyink-ruler-h',
      onClick,
      onMouseleave,
      onMousemove,
      ref: canvasRef,
      style: { cursor: 'pointer', display: 'block', height: '100%', width: '100%' },
    })
  },
})
