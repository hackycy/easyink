import type { DesignerContext, GuideLineData } from '../types'
import { toPixels } from '@easyink/core'
import { defineComponent, h, inject } from 'vue'
import { DESIGNER_INJECTION_KEY } from '../types'

export const GuideLines = defineComponent({
  name: 'GuideLines',
  setup() {
    const ctx = inject(DESIGNER_INJECTION_KEY) as DesignerContext

    function onGuideMousedown(guide: GuideLineData, e: MouseEvent): void {
      e.stopPropagation()
      e.preventDefault()

      const startY = e.clientY
      const startX = e.clientX
      const startPos = guide.position
      const zoom = ctx.canvas.zoom.value

      function onMove(me: MouseEvent): void {
        const delta = guide.orientation === 'horizontal'
          ? me.clientY - startY
          : me.clientX - startX
        const unitDelta = delta / (96 / 25.4) / zoom // approximate for mm
        // Live update via direct manipulation (not command)
        const guides = ctx.guides.guides.value
        const target = guides.find(g => g.id === guide.id)
        if (target) {
          // We need fromPixels but approximate is fine for live update
          ctx.engine.schema.updateExtensions('guides', guides.map(g =>
            g.id === guide.id ? { ...g, position: startPos + unitDelta } : g,
          ))
        }
      }

      function onUp(me: MouseEvent): void {
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onUp)

        const delta = guide.orientation === 'horizontal'
          ? me.clientY - startY
          : me.clientX - startX
        const unitDelta = delta / (96 / 25.4) / zoom

        // Revert live changes
        ctx.engine.schema.updateExtensions('guides', ctx.guides.guides.value.map(g =>
          g.id === guide.id ? { ...g, position: startPos } : g,
        ))

        if (Math.abs(unitDelta) < 0.1) {
          return
        }

        ctx.guides.updateGuidePosition(guide.id, startPos + unitDelta)
      }

      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
    }

    return () => {
      const guides = ctx.guides.guides.value
      const unit = ctx.engine.schema.schema.page.unit
      const zoom = ctx.canvas.zoom.value

      return h('div', { class: 'easyink-guide-lines' }, guides.map((guide) => {
        const px = toPixels(guide.position, unit, 96, zoom)
        const style = guide.orientation === 'vertical'
          ? {
              cursor: 'col-resize',
              height: '100%',
              left: `${px}px`,
              position: 'absolute' as const,
              top: '0',
              width: '3px',
            }
          : {
              cursor: 'row-resize',
              height: '3px',
              left: '0',
              position: 'absolute' as const,
              top: `${px}px`,
              width: '100%',
            }
        return h('div', {
          class: `easyink-guide-line easyink-guide-line--${guide.orientation}`,
          key: guide.id,
          onMousedown: (e: MouseEvent) => onGuideMousedown(guide, e),
          style,
        })
      }))
    }
  },
})
