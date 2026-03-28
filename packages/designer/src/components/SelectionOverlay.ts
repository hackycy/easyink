import type { ResizeHandlePosition } from '../types'
import { toPixels } from '@easyink/core'
import { computed, defineComponent, h, inject } from 'vue'
import { DESIGNER_INJECTION_KEY } from '../types'

const HANDLES: ResizeHandlePosition[] = [
  'top-left',
  'top',
  'top-right',
  'left',
  'right',
  'bottom-left',
  'bottom',
  'bottom-right',
]

export const SelectionOverlay = defineComponent({
  name: 'SelectionOverlay',
  setup() {
    const ctx = inject(DESIGNER_INJECTION_KEY)!

    const overlayStyle = computed(() => {
      const el = ctx.selection.selectedElement.value
      if (!el) {
        return null
      }

      const layout = el.layout
      const unit = ctx.engine.schema.schema.page.unit
      const zoom = ctx.canvas.zoom.value
      const px = (v: number) => toPixels(v, unit, 96, zoom)

      const x = px(layout.x ?? 0)
      const y = px(layout.y ?? 0)
      const w = px(typeof layout.width === 'number' ? layout.width : 100)
      const ht = px(typeof layout.height === 'number' ? layout.height : 60)

      return { height: ht, width: w, x, y }
    })

    function handlePosition(handle: ResizeHandlePosition, box: { x: number, y: number, width: number, height: number }) {
      const hs = 4 // half handle size
      const map: Record<ResizeHandlePosition, { left: number, top: number }> = {
        'bottom': { left: box.width / 2 - hs, top: box.height - hs },
        'bottom-left': { left: -hs, top: box.height - hs },
        'bottom-right': { left: box.width - hs, top: box.height - hs },
        'left': { left: -hs, top: box.height / 2 - hs },
        'right': { left: box.width - hs, top: box.height / 2 - hs },
        'top': { left: box.width / 2 - hs, top: -hs },
        'top-left': { left: -hs, top: -hs },
        'top-right': { left: box.width - hs, top: -hs },
      }
      return map[handle]
    }

    function onBorderMousedown(e: MouseEvent): void {
      e.stopPropagation()
      const el = ctx.selection.selectedElement.value
      if (!el) {
        return
      }
      ctx.interaction.startDrag(el.id, e)
    }

    function onHandleMousedown(handle: ResizeHandlePosition, e: MouseEvent): void {
      e.stopPropagation()
      const el = ctx.selection.selectedElement.value
      if (!el) {
        return
      }
      ctx.interaction.startResize(el.id, handle, e)
    }

    return () => {
      const box = overlayStyle.value
      if (!box) {
        return null
      }

      const children = HANDLES.map((handle) => {
        const pos = handlePosition(handle, box)
        return h('div', {
          class: `easyink-handle easyink-handle--${handle}`,
          key: handle,
          style: {
            left: `${pos.left}px`,
            top: `${pos.top}px`,
          },
          onMousedown: (e: MouseEvent) => onHandleMousedown(handle, e),
        })
      })

      return h('div', {
        class: 'easyink-selection-box easyink-selection-box--draggable',
        style: {
          height: `${box.height}px`,
          left: `${box.x}px`,
          top: `${box.y}px`,
          width: `${box.width}px`,
        },
        onMousedown: onBorderMousedown,
      }, children)
    }
  },
})
