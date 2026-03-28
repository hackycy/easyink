import { createUpdateBindingCommand, toPixels } from '@easyink/core'
import { defineComponent, h, inject, nextTick, onMounted, ref, watch } from 'vue'
import { DESIGNER_INJECTION_KEY } from '../types'
import { AlignmentGuides } from './AlignmentGuides'
import { GuideLines } from './GuideLines'
import { RulerHorizontal } from './RulerHorizontal'
import { RulerVertical } from './RulerVertical'
import { SelectionOverlay } from './SelectionOverlay'

export const DesignCanvas = defineComponent({
  name: 'DesignCanvas',
  setup() {
    const ctx = inject(DESIGNER_INJECTION_KEY)!
    const viewportRef = ref<HTMLElement | null>(null)
    const renderTargetRef = ref<HTMLElement | null>(null)
    const pageWrapperRef = ref<HTMLElement | null>(null)
    let spaceHeld = false

    // ── 渲染 ──

    function rerender(): void {
      const target = renderTargetRef.value
      if (!target) {
        return
      }
      ctx.renderer.zoom = ctx.canvas.zoom.value
      ctx.renderer.render(
        ctx.engine.schema.schema,
        ctx.engine.getData(),
        target,
      )
    }

    onMounted(() => {
      rerender()
    })

    watch(() => ctx.schema.value, () => {
      nextTick(rerender)
    })

    watch(() => ctx.canvas.zoom.value, () => {
      rerender()
    })

    // ── 缩放 ──

    function onWheel(e: WheelEvent): void {
      if (!e.ctrlKey && !e.metaKey) {
        return
      }
      e.preventDefault()
      const delta = e.deltaY > 0 ? -0.1 : 0.1
      ctx.canvas.setZoom(ctx.canvas.zoom.value + delta)
    }

    // ── 键盘 ──

    function onKeydown(e: KeyboardEvent): void {
      if (e.code === 'Space' && !spaceHeld) {
        spaceHeld = true
        ctx.canvas.isPanning.value = true
      }
      if (e.code === 'Delete' || e.code === 'Backspace') {
        ctx.removeSelected()
      }
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyA') {
        e.preventDefault()
        ctx.selection.selectAll()
      }
    }

    function onKeyup(e: KeyboardEvent): void {
      if (e.code === 'Space') {
        spaceHeld = false
        ctx.canvas.isPanning.value = false
      }
    }

    // ── 平移 ──

    let panStartX = 0
    let panStartY = 0
    let panStartPanX = 0
    let panStartPanY = 0

    function onViewportMousedown(e: MouseEvent): void {
      if (ctx.canvas.isPanning.value || e.button === 1) {
        e.preventDefault()
        panStartX = e.clientX
        panStartY = e.clientY
        panStartPanX = ctx.canvas.panX.value
        panStartPanY = ctx.canvas.panY.value
        document.addEventListener('mousemove', onPanMove)
        document.addEventListener('mouseup', onPanEnd)
      }
    }

    function onPanMove(e: MouseEvent): void {
      ctx.canvas.setPan(
        panStartPanX + (e.clientX - panStartX),
        panStartPanY + (e.clientY - panStartY),
      )
    }

    function onPanEnd(): void {
      document.removeEventListener('mousemove', onPanMove)
      document.removeEventListener('mouseup', onPanEnd)
    }

    // ── 元素选择（点击命中检测） ──

    function onCanvasClick(e: MouseEvent): void {
      if (ctx.canvas.isPanning.value) {
        return
      }

      // 从目标往上遍历查找 data-element-id
      let target = e.target as HTMLElement | null
      while (target && target !== renderTargetRef.value) {
        const id = target.dataset?.elementId
        if (id) {
          if (e.shiftKey) {
            ctx.selection.toggleSelect(id)
          }
          else {
            ctx.selection.select(id)
          }
          return
        }
        target = target.parentElement
      }

      // 点击空白区域取消选择
      ctx.selection.deselect()
    }

    // ── 框选 ──

    function onPageWrapperMousedown(e: MouseEvent): void {
      if (ctx.canvas.isPanning.value) {
        return
      }
      // Only start marquee on left-click directly on page wrapper (not on elements)
      if (e.button !== 0) {
        return
      }
      // Check if click is on an element
      let target = e.target as HTMLElement | null
      while (target && target !== pageWrapperRef.value) {
        if (target.dataset?.elementId) {
          return // Click on element, don't start marquee
        }
        target = target.parentElement
      }

      const wrapper = pageWrapperRef.value
      if (!wrapper) {
        return
      }
      const rect = wrapper.getBoundingClientRect()
      ctx.marquee.startMarquee(e, rect.left, rect.top)
    }

    // ── 数据绑定拖放 ──

    function onPageDragover(e: DragEvent): void {
      if (e.dataTransfer?.types.includes('application/easyink-binding')) {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'link'
      }
    }

    function onPageDrop(e: DragEvent): void {
      const raw = e.dataTransfer?.getData('application/easyink-binding')
      if (!raw) {
        return
      }
      e.preventDefault()

      let binding: { path: string }
      try {
        binding = JSON.parse(raw)
      }
      catch {
        return
      }

      // Find target element
      let target = e.target as HTMLElement | null
      while (target && target !== renderTargetRef.value) {
        const id = target.dataset?.elementId
        if (id) {
          const el = ctx.engine.schema.getElementById(id)
          if (el) {
            const cmd = createUpdateBindingCommand({
              elementId: id,
              newBinding: { path: binding.path },
              oldBinding: el.binding,
            }, ctx.engine.operations)
            ctx.engine.execute(cmd)
          }
          return
        }
        target = target.parentElement
      }
    }

    return () => {
      const marqueeRect = ctx.marquee.marqueeRect.value
      const unit = ctx.engine.schema.schema.page.unit
      const zoom = ctx.canvas.zoom.value

      // Marquee overlay (in page coordinates)
      const marqueeDiv = marqueeRect
        ? h('div', {
            class: 'easyink-marquee',
            style: {
              height: `${toPixels(marqueeRect.height, unit, 96, zoom)}px`,
              left: `${toPixels(marqueeRect.x, unit, 96, zoom)}px`,
              top: `${toPixels(marqueeRect.y, unit, 96, zoom)}px`,
              width: `${toPixels(marqueeRect.width, unit, 96, zoom)}px`,
            },
          })
        : null

      return h('div', {
        class: 'easyink-canvas-area',
        tabindex: 0,
        onKeydown,
        onKeyup,
      }, [
        // Grid layout: ruler-corner + horizontal ruler + vertical ruler + viewport
        h('div', { class: 'easyink-ruler-corner' }),
        h(RulerHorizontal),
        h(RulerVertical),
        h('div', {
          class: 'easyink-canvas-viewport',
          ref: viewportRef,
          onMousedown: onViewportMousedown,
          onWheel,
        }, [
          h('div', {
            class: 'easyink-canvas-scroll',
            style: {
              transform: `translate(${ctx.canvas.panX.value}px, ${ctx.canvas.panY.value}px)`,
            },
          }, [
            h('div', {
              class: 'easyink-canvas-zoom',
              style: {
                transform: `scale(${ctx.canvas.zoom.value})`,
              },
            }, [
              h('div', {
                class: 'easyink-canvas-page-wrapper',
                onClick: onCanvasClick,
                onDragover: onPageDragover,
                onDrop: onPageDrop,
                onMousedown: onPageWrapperMousedown,
                ref: pageWrapperRef,
              }, [
                h('div', {
                  ref: renderTargetRef,
                }),
                h(SelectionOverlay),
                h(AlignmentGuides),
                h(GuideLines),
                marqueeDiv,
              ]),
            ]),
          ]),
        ]),
      ])
    }
  },
})
