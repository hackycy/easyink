import type { DesignerContext, GuideLineData } from '../types'
import { fromPixels, toPixels } from '@easyink/core'
import { defineComponent, h, inject, ref } from 'vue'
import { DESIGNER_INJECTION_KEY } from '../types'

export const GuideLines = defineComponent({
  name: 'GuideLines',
  setup() {
    const ctx = inject(DESIGNER_INJECTION_KEY) as DesignerContext
    const draggingId = ref<string | null>(null)
    const isOverRuler = ref(false)

    function onGuideMousedown(guide: GuideLineData, e: MouseEvent): void {
      e.stopPropagation()
      e.preventDefault()

      const startY = e.clientY
      const startX = e.clientX
      const startPos = guide.position
      const unit = ctx.engine.schema.schema.page.unit
      const zoom = ctx.canvas.zoom.value

      draggingId.value = guide.id
      isOverRuler.value = false

      function checkOverRuler(clientX: number, clientY: number): boolean {
        const viewport = document.querySelector('.easyink-canvas-viewport')
        if (!viewport) {
          return false
        }
        const rect = viewport.getBoundingClientRect()
        if (guide.orientation === 'horizontal') {
          return clientY < rect.top
        }
        return clientX < rect.left
      }

      function onMove(me: MouseEvent): void {
        const delta = guide.orientation === 'horizontal'
          ? me.clientY - startY
          : me.clientX - startX
        const unitDelta = fromPixels(delta, unit, 96, zoom)
        // Live update via direct manipulation (not command)
        ctx.engine.schema.updateExtensions('guides', ctx.guides.guides.value.map(g =>
          g.id === guide.id ? { ...g, position: startPos + unitDelta } : g,
        ))
        isOverRuler.value = checkOverRuler(me.clientX, me.clientY)
      }

      function onUp(me: MouseEvent): void {
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onUp)
        draggingId.value = null

        const delta = guide.orientation === 'horizontal'
          ? me.clientY - startY
          : me.clientX - startX
        const unitDelta = fromPixels(delta, unit, 96, zoom)

        // Revert live changes
        ctx.engine.schema.updateExtensions('guides', ctx.guides.guides.value.map(g =>
          g.id === guide.id ? { ...g, position: startPos } : g,
        ))

        // If released over ruler area, delete the guide
        if (checkOverRuler(me.clientX, me.clientY)) {
          isOverRuler.value = false
          ctx.guides.removeGuide(guide.id)
          return
        }

        isOverRuler.value = false

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
      const preview = ctx.guides.previewGuide.value
      const unit = ctx.engine.schema.schema.page.unit
      const zoom = ctx.canvas.zoom.value

      // Use 1/zoom so the visual line is always 1 physical pixel
      const lineWidth = `${1 / zoom}px`
      // Hit area is wider for easy dragging (6 physical px)
      const hitWidth = `${6 / zoom}px`

      // Large enough to cover the full viewport regardless of zoom/pan
      const fullSpan = '99999px'

      const children = guides.map((guide) => {
        const px = toPixels(guide.position, unit, 96, zoom)
        const isDragging = draggingId.value === guide.id
        const showDeleting = isDragging && isOverRuler.value

        const classList = [
          'easyink-guide-line',
          `easyink-guide-line--${guide.orientation}`,
          showDeleting ? 'easyink-guide-line--deleting' : '',
        ].filter(Boolean).join(' ')

        const style = guide.orientation === 'vertical'
          ? {
              borderLeftStyle: 'solid' as const,
              borderLeftWidth: lineWidth,
              cursor: 'col-resize',
              height: fullSpan,
              left: `${px}px`,
              position: 'absolute' as const,
              top: '0',
              width: hitWidth,
            }
          : {
              borderTopStyle: 'solid' as const,
              borderTopWidth: lineWidth,
              cursor: 'row-resize',
              height: hitWidth,
              left: '0',
              position: 'absolute' as const,
              top: `${px}px`,
              width: fullSpan,
            }
        return h('div', {
          class: classList,
          key: guide.id,
          onMousedown: (e: MouseEvent) => onGuideMousedown(guide, e),
          style,
        })
      })

      // Render preview guide line
      if (preview) {
        const px = toPixels(preview.position, unit, 96, zoom)
        const style = preview.orientation === 'vertical'
          ? {
              borderLeftStyle: 'dashed' as const,
              borderLeftWidth: lineWidth,
              height: fullSpan,
              left: `${px}px`,
              position: 'absolute' as const,
              top: '0',
              width: '0',
            }
          : {
              borderTopStyle: 'dashed' as const,
              borderTopWidth: lineWidth,
              height: '0',
              left: '0',
              position: 'absolute' as const,
              top: `${px}px`,
              width: fullSpan,
            }
        children.push(h('div', {
          class: `easyink-guide-line easyink-guide-line--preview easyink-guide-line--${preview.orientation}`,
          key: '__preview__',
          style,
        }))
      }

      return h('div', { class: 'easyink-guide-lines' }, children)
    }
  },
})
