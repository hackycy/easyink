import type { CanvasEvent } from '../interaction/strategy'
import { fromPixels } from '@easyink/core'
import { computed, defineComponent, h, inject } from 'vue'
import { DESIGNER_INJECTION_KEY } from '../types'

export const MaterialInteractionLayer = defineComponent({
  name: 'MaterialInteractionLayer',
  setup() {
    const ctx = inject(DESIGNER_INJECTION_KEY)!

    const selectedMaterial = computed(() => {
      return ctx.selection.selectedElement.value
    })

    function buildCanvasEvent(e: MouseEvent): CanvasEvent | null {
      const material = selectedMaterial.value
      if (!material) {
        return null
      }

      const wrapper = document.querySelector('.easyink-canvas-page-wrapper') as HTMLElement | null
      if (!wrapper) {
        return null
      }

      const wrapperRect = wrapper.getBoundingClientRect()
      const unit = ctx.engine.schema.schema.page.unit
      const zoom = ctx.canvas.zoom.value
      const pageX = fromPixels(e.clientX - wrapperRect.left, unit, 96, zoom)
      const pageY = fromPixels(e.clientY - wrapperRect.top, unit, 96, zoom)

      return {
        material,
        originalEvent: e,
        pageX,
        pageY,
      }
    }

    function onDoubleClick(e: MouseEvent): void {
      const material = selectedMaterial.value
      if (!material || !ctx.strategyManager) {
        return
      }

      const canvasEvent = buildCanvasEvent(e)
      if (!canvasEvent) {
        return
      }

      const strategy = ctx.strategyManager.getRegistry().get(material.type)
      const state = ctx.strategyManager.getState()

      if (state === 'selected') {
        const consumed = strategy.onDoubleClick?.(canvasEvent, state)
        if (consumed) {
          e.stopPropagation()
          ctx.strategyManager.enterEditing(material)
        }
      }
    }

    function onMouseDown(e: MouseEvent): void {
      const material = selectedMaterial.value
      if (!material || !ctx.strategyManager) {
        return
      }

      const canvasEvent = buildCanvasEvent(e)
      if (!canvasEvent) {
        return
      }

      const strategy = ctx.strategyManager.getRegistry().get(material.type)
      const state = ctx.strategyManager.getState()
      const consumed = strategy.onMouseDown?.(canvasEvent, state)
      if (consumed) {
        e.stopPropagation()
      }
    }

    return () => {
      const material = selectedMaterial.value
      if (!material || !ctx.strategyManager) {
        return null
      }

      const strategy = ctx.strategyManager.getRegistry().get(material.type)
      const state = ctx.strategyManager.getState()
      const overlay = strategy.renderOverlay?.(state, material)

      return h('div', {
        class: 'easyink-material-interaction-layer',
        onDblclick: onDoubleClick,
        onMousedown: onMouseDown,
      }, overlay ? [overlay] : [])
    }
  },
})
