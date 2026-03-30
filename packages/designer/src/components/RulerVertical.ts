import type { DesignerContext } from '../types'
import { fromPixels, toPixels } from '@easyink/core'
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
      c.font = '9px sans-serif'

      const startUnit = Math.floor(-offset / majorPx) * majorStep - majorStep
      const endUnit = startUnit + (height / majorPx + 2) * majorStep

      // Skip labels when too dense: ensure at least ~40px between labels
      const labelEvery = majorPx >= 40 ? 1 : Math.ceil(40 / majorPx)

      for (let val = startUnit; val <= endUnit; val += minorStep) {
        const px = toPixels(val, unit, 96, zoom) + offset
        if (px < 0 || px > height) {
          continue
        }

        const isMajor = Math.abs(val % majorStep) < 0.001

        c.beginPath()
        if (isMajor) {
          const majorIndex = Math.round(val / majorStep)
          const showLabel = majorIndex % labelEvery === 0
          c.lineWidth = 1
          c.moveTo(width, px)
          c.lineTo(width * 0.4, px)
          c.stroke()
          if (showLabel) {
            c.save()
            c.translate(width * 0.15, px)
            c.rotate(-Math.PI / 2)
            c.textAlign = 'center'
            c.textBaseline = 'top'
            c.fillText(String(Math.round(val)), 0, 0)
            c.restore()
          }
        }
        else if (drawMinor) {
          c.lineWidth = 0.5
          c.moveTo(width, px)
          c.lineTo(width * 0.65, px)
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

    function getPageY(clientY: number): number {
      const canvas = canvasRef.value
      if (!canvas) {
        return 0
      }
      const rect = canvas.getBoundingClientRect()
      const unit = ctx.engine.schema.schema.page.unit
      const zoom = ctx.canvas.zoom.value
      const panY = ctx.canvas.panY.value
      return fromPixels(clientY - rect.top - panY, unit, 96, zoom)
    }

    function onMousemove(e: MouseEvent): void {
      const pageY = getPageY(e.clientY)
      ctx.guides.setPreview({ orientation: 'horizontal', position: pageY })
    }

    function onMouseleave(): void {
      ctx.guides.clearPreview()
    }

    function onClick(e: MouseEvent): void {
      const pageY = getPageY(e.clientY)
      ctx.guides.addGuide('horizontal', pageY)
    }

    return () => h('canvas', {
      class: 'easyink-ruler-v',
      onClick,
      onMouseleave,
      onMousemove,
      ref: canvasRef,
      style: { cursor: 'pointer', display: 'block', height: '100%', width: '100%' },
    })
  },
})
