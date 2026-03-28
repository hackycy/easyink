import { defineComponent, h, inject, nextTick, onMounted, ref, watch } from 'vue'
import { DESIGNER_INJECTION_KEY } from '../types'
import { SelectionOverlay } from './SelectionOverlay'

export const DesignCanvas = defineComponent({
  name: 'DesignCanvas',
  setup() {
    const ctx = inject(DESIGNER_INJECTION_KEY)!
    const viewportRef = ref<HTMLElement | null>(null)
    const renderTargetRef = ref<HTMLElement | null>(null)
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

    // ── 平移 ──

    function onKeydown(e: KeyboardEvent): void {
      if (e.code === 'Space' && !spaceHeld) {
        spaceHeld = true
        ctx.canvas.isPanning.value = true
      }
      if (e.code === 'Delete' || e.code === 'Backspace') {
        ctx.removeSelected()
      }
    }

    function onKeyup(e: KeyboardEvent): void {
      if (e.code === 'Space') {
        spaceHeld = false
        ctx.canvas.isPanning.value = false
      }
    }

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
      // 不处理平移中的点击
      if (ctx.canvas.isPanning.value) {
        return
      }

      // 从目标往上遍历查找 data-element-id
      let target = e.target as HTMLElement | null
      while (target && target !== renderTargetRef.value) {
        const id = target.dataset?.elementId
        if (id) {
          ctx.selection.select(id)
          return
        }
        target = target.parentElement
      }

      // 点击空白区域取消选择
      ctx.selection.deselect()
    }

    return () => {
      return h('div', {
        class: 'easyink-canvas-area',
        tabindex: 0,
        onKeydown,
        onKeyup,
      }, [
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
              }, [
                h('div', {
                  ref: renderTargetRef,
                }),
                h(SelectionOverlay),
              ]),
            ]),
          ]),
        ]),
      ])
    }
  },
})
