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

    function toPx(v: number): number {
      const unit = ctx.engine.schema.schema.page.unit
      return toPixels(v, unit, 96, ctx.canvas.zoom.value)
    }

    const primaryBox = computed(() => {
      const el = ctx.selection.selectedElement.value
      if (!el || ctx.selection.selectedIds.value.length !== 1) {
        return null
      }

      const layout = el.layout
      return {
        height: toPx(typeof layout.height === 'number' ? layout.height : 60),
        width: toPx(typeof layout.width === 'number' ? layout.width : 100),
        x: toPx(layout.x ?? 0),
        y: toPx(layout.y ?? 0),
      }
    })

    const isMulti = computed(() => ctx.selection.selectedIds.value.length > 1)

    const multiBoxes = computed(() => {
      if (!isMulti.value) {
        return []
      }
      return ctx.selection.selectedElements.value.map(el => ({
        height: toPx(typeof el.layout.height === 'number' ? el.layout.height : 60),
        id: el.id,
        width: toPx(typeof el.layout.width === 'number' ? el.layout.width : 100),
        x: toPx(el.layout.x ?? 0),
        y: toPx(el.layout.y ?? 0),
      }))
    })

    const multiBounds = computed(() => {
      const bounds = ctx.selection.selectionBounds.value
      if (!bounds || !isMulti.value) {
        return null
      }
      return {
        height: toPx(bounds.height),
        width: toPx(bounds.width),
        x: toPx(bounds.x),
        y: toPx(bounds.y),
      }
    })

    function handlePosition(handle: ResizeHandlePosition, box: { height: number, width: number, x: number, y: number }) {
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
      const ids = ctx.selection.selectedIds.value
      if (ids.length === 0) {
        return
      }
      // Start drag on the first selected element (multi-drag is handled by useInteraction)
      ctx.interaction.startDrag(ids[0], e)
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
      const children: ReturnType<typeof h>[] = []

      // Single selection: box + handles
      const box = primaryBox.value
      if (box) {
        const handles = HANDLES.map((handle) => {
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

        children.push(h('div', {
          class: 'easyink-selection-box easyink-selection-box--draggable',
          style: {
            height: `${box.height}px`,
            left: `${box.x}px`,
            top: `${box.y}px`,
            width: `${box.width}px`,
          },
          onMousedown: onBorderMousedown,
        }, handles))
      }

      // Multi selection: individual dashed boxes + bounding box
      if (isMulti.value) {
        for (const mb of multiBoxes.value) {
          children.push(h('div', {
            class: 'easyink-selection-box easyink-selection-box--multi-item',
            key: `multi-${mb.id}`,
            style: {
              height: `${mb.height}px`,
              left: `${mb.x}px`,
              top: `${mb.y}px`,
              width: `${mb.width}px`,
            },
          }))
        }

        const bounds = multiBounds.value
        if (bounds) {
          children.push(h('div', {
            class: 'easyink-selection-box easyink-selection-box--multi-bounds easyink-selection-box--draggable',
            key: 'multi-bounds',
            style: {
              height: `${bounds.height}px`,
              left: `${bounds.x}px`,
              top: `${bounds.y}px`,
              width: `${bounds.width}px`,
            },
            onMousedown: onBorderMousedown,
          }))
        }
      }

      if (children.length === 0) {
        return null
      }

      return h('div', { class: 'easyink-selection-overlay' }, children)
    }
  },
})
