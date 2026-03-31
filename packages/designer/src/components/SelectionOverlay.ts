import type { ResizeHandlePosition } from '../types'
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

const CORNER_HANDLES: ResizeHandlePosition[] = [
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right',
]

interface OverlayBox {
  bounds: { height: number, width: number, x: number, y: number }
  height: number
  id: string
  rotation: number
  width: number
  x: number
  y: number
}

export const SelectionOverlay = defineComponent({
  name: 'SelectionOverlay',
  setup() {
    const ctx = inject(DESIGNER_INJECTION_KEY)!

    function parsePx(value?: string): number {
      return Number.parseFloat(value ?? '') || 0
    }

    function parseRotation(transform?: string): number {
      if (!transform) {
        return 0
      }
      const match = /rotate\(([-\d.]+)deg\)/.exec(transform)
      return match ? Number.parseFloat(match[1]) || 0 : 0
    }

    function getPageWrapper(): HTMLElement | null {
      return document.querySelector('.easyink-canvas-page-wrapper') as HTMLElement | null
    }

    function getWrapperPadding(wrapper: HTMLElement): { x: number, y: number } {
      const styles = getComputedStyle(wrapper)
      return {
        x: parsePx(styles.paddingLeft),
        y: parsePx(styles.paddingTop),
      }
    }

    function getElementBounds(element: HTMLElement, wrapper: HTMLElement): { height: number, width: number, x: number, y: number } {
      const elementRect = element.getBoundingClientRect()
      const wrapperRect = wrapper.getBoundingClientRect()
      const scaleX = wrapper.offsetWidth > 0 ? wrapperRect.width / wrapper.offsetWidth : 1
      const scaleY = wrapper.offsetHeight > 0 ? wrapperRect.height / wrapper.offsetHeight : 1
      return {
        height: scaleY > 0 ? elementRect.height / scaleY : elementRect.height,
        width: scaleX > 0 ? elementRect.width / scaleX : elementRect.width,
        x: scaleX > 0 ? (elementRect.left - wrapperRect.left) / scaleX : elementRect.left - wrapperRect.left,
        y: scaleY > 0 ? (elementRect.top - wrapperRect.top) / scaleY : elementRect.top - wrapperRect.top,
      }
    }

    function hasTransformedAncestor(element: HTMLElement, wrapper: HTMLElement): boolean {
      let current = element.parentElement
      while (current && current !== wrapper) {
        if (current.classList.contains('easyink-element') && current.style.transform) {
          return true
        }
        current = current.parentElement
      }
      return false
    }

    function getMeasuredBox(id: string): OverlayBox | null {
      const wrapper = getPageWrapper()
      if (!wrapper) {
        return null
      }

      const element = Array.from(wrapper.querySelectorAll('.easyink-element')).find(node => (node as HTMLElement).dataset.elementId === id) as HTMLElement | undefined
      if (!element) {
        return null
      }

      const bounds = getElementBounds(element, wrapper)
      const baseWidth = parsePx(element.style.width)
      const baseHeight = parsePx(element.style.height)

      if (hasTransformedAncestor(element, wrapper) || (!baseWidth && !baseHeight)) {
        return {
          bounds,
          height: bounds.height,
          id,
          rotation: 0,
          width: bounds.width,
          x: bounds.x,
          y: bounds.y,
        }
      }

      const padding = getWrapperPadding(wrapper)
      let x = padding.x
      let y = padding.y
      let reachedContent = false
      let current: HTMLElement | null = element

      while (current && current !== wrapper) {
        if (current.classList.contains('easyink-content') || current.classList.contains('easyink-element')) {
          x += parsePx(current.style.left)
          y += parsePx(current.style.top)
          if (current.classList.contains('easyink-content')) {
            reachedContent = true
          }
        }
        current = current.parentElement
      }

      if (!reachedContent) {
        return {
          bounds,
          height: bounds.height,
          id,
          rotation: 0,
          width: bounds.width,
          x: bounds.x,
          y: bounds.y,
        }
      }

      return {
        bounds,
        height: baseHeight || bounds.height,
        id,
        rotation: parseRotation(element.style.transform),
        width: baseWidth || bounds.width,
        x,
        y,
      }
    }

    const primaryBox = computed(() => {
      const renderVersion = ctx.canvas.renderVersion.value
      const ids = ctx.selection.selectedIds.value
      void renderVersion
      if (ids.length !== 1) {
        return null
      }
      return getMeasuredBox(ids[0])
    })

    const isMulti = computed(() => ctx.selection.selectedIds.value.length > 1)

    const multiBoxes = computed(() => {
      const renderVersion = ctx.canvas.renderVersion.value
      void renderVersion
      if (!isMulti.value) {
        return []
      }
      return ctx.selection.selectedIds.value
        .map(id => getMeasuredBox(id))
        .filter((box): box is OverlayBox => box !== null)
    })

    const multiBounds = computed(() => {
      const boxes = multiBoxes.value
      if (!isMulti.value || boxes.length === 0) {
        return null
      }

      let minX = Infinity
      let minY = Infinity
      let maxX = -Infinity
      let maxY = -Infinity

      for (const box of boxes) {
        minX = Math.min(minX, box.bounds.x)
        minY = Math.min(minY, box.bounds.y)
        maxX = Math.max(maxX, box.bounds.x + box.bounds.width)
        maxY = Math.max(maxY, box.bounds.y + box.bounds.height)
      }

      return {
        height: maxY - minY,
        width: maxX - minX,
        x: minX,
        y: minY,
      }
    })

    function handlePosition(handle: ResizeHandlePosition, box: { height: number, width: number }) {
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

    function rotationZonePosition(corner: ResizeHandlePosition, box: { height: number, width: number }) {
      const offset = -16 // zone completely outside the box edge
      const map: Partial<Record<ResizeHandlePosition, { left: number, top: number }>> = {
        'bottom-left': { left: offset, top: box.height },
        'bottom-right': { left: box.width, top: box.height },
        'top-left': { left: offset, top: offset },
        'top-right': { left: box.width, top: offset },
      }
      return map[corner]!
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

    function onRotateMousedown(e: MouseEvent): void {
      e.stopPropagation()
      const el = ctx.selection.selectedElement.value
      if (!el) {
        return
      }
      const boxEl = (e.currentTarget as HTMLElement | null)?.closest('.easyink-selection-box') as HTMLElement | null
      if (!boxEl) {
        return
      }
      const boxRect = boxEl.getBoundingClientRect()
      const centerScreenX = boxRect.left + boxRect.width / 2
      const centerScreenY = boxRect.top + boxRect.height / 2

      ctx.interaction.startRotate(el.id, e, centerScreenX, centerScreenY)
    }

    return () => {
      const children: ReturnType<typeof h>[] = []

      // Single selection: box + handles + rotation zones
      const box = primaryBox.value
      if (box) {
        const boxChildren: ReturnType<typeof h>[] = []

        // Resize handles
        for (const handle of HANDLES) {
          const pos = handlePosition(handle, box)
          boxChildren.push(h('div', {
            class: `easyink-handle easyink-handle--${handle}`,
            key: handle,
            style: {
              left: `${pos.left}px`,
              top: `${pos.top}px`,
            },
            onMousedown: (e: MouseEvent) => onHandleMousedown(handle, e),
          }))
        }

        // Rotation zones at corners
        for (const corner of CORNER_HANDLES) {
          const pos = rotationZonePosition(corner, box)
          boxChildren.push(h('div', {
            class: `easyink-rotation-zone easyink-rotation-zone--${corner}`,
            key: `rotate-${corner}`,
            style: {
              left: `${pos.left}px`,
              top: `${pos.top}px`,
            },
            onMousedown: onRotateMousedown,
          }))
        }

        const boxStyle: Record<string, string> = {
          height: `${box.height}px`,
          left: `${box.x}px`,
          top: `${box.y}px`,
          width: `${box.width}px`,
        }

        // Apply rotation transform if element is rotated
        if (box.rotation) {
          boxStyle.transform = `rotate(${box.rotation}deg)`
          boxStyle.transformOrigin = 'center center'
        }

        children.push(h('div', {
          class: 'easyink-selection-box easyink-selection-box--draggable',
          style: boxStyle,
          onMousedown: onBorderMousedown,
        }, boxChildren))
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
