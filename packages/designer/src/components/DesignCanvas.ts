import type { MaterialNode } from '@easyink/core'
import { createMoveMaterialCommand, createUpdateBindingCommand, toPixels } from '@easyink/core'
import { generateId } from '@easyink/shared'
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
      ctx.canvas.markRendered()
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
      // Undo/Redo
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.code === 'KeyZ') {
        e.preventDefault()
        ctx.undo()
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.code === 'KeyZ') {
        e.preventDefault()
        ctx.redo()
      }
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyY') {
        e.preventDefault()
        ctx.redo()
      }
      // Escape: close context menu / deselect
      if (e.code === 'Escape') {
        if (ctx.contextMenu.visible.value) {
          ctx.contextMenu.hide()
        }
        else {
          ctx.selection.deselect()
        }
      }
      // Arrow key nudge
      if (e.code === 'ArrowUp' || e.code === 'ArrowDown' || e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
        const ids = ctx.selection.selectedIds.value
        if (ids.length === 0) {
          return
        }
        e.preventDefault()
        const step = e.shiftKey ? 10 : 1
        let dx = 0
        let dy = 0
        if (e.code === 'ArrowLeft') {
          dx = -step
        }
        if (e.code === 'ArrowRight') {
          dx = step
        }
        if (e.code === 'ArrowUp') {
          dy = -step
        }
        if (e.code === 'ArrowDown') {
          dy = step
        }
        _nudgeElements(ids, dx, dy)
      }
    }

    function onKeyup(e: KeyboardEvent): void {
      if (e.code === 'Space') {
        spaceHeld = false
        ctx.canvas.isPanning.value = false
      }
    }

    // ── 方向键微调 ──

    function _nudgeElements(ids: string[], dx: number, dy: number): void {
      if (ids.length === 1) {
        const el = ctx.engine.schema.getMaterialById(ids[0])
        if (!el || el.locked || el.hidden) {
          return
        }
        const oldX = el.layout.x ?? 0
        const oldY = el.layout.y ?? 0
        const cmd = createMoveMaterialCommand({
          materialId: el.id,
          newX: oldX + dx,
          newY: oldY + dy,
          oldX,
          oldY,
        }, ctx.engine.operations)
        ctx.engine.execute(cmd)
      }
      else {
        const movable = ids
          .map(id => ctx.engine.schema.getMaterialById(id))
          .filter((el): el is NonNullable<typeof el> => !!el && !el.locked && !el.hidden)
        if (movable.length === 0) {
          return
        }
        ctx.engine.commands.beginTransaction('批量微调')
        for (const el of movable) {
          const oldX = el.layout.x ?? 0
          const oldY = el.layout.y ?? 0
          const cmd = createMoveMaterialCommand({
            materialId: el.id,
            newX: oldX + dx,
            newY: oldY + dy,
            oldX,
            oldY,
          }, ctx.engine.operations)
          ctx.engine.execute(cmd)
        }
        ctx.engine.commands.commitTransaction()
      }
    }

    // ── 右键菜单 ──

    function onContextmenu(e: MouseEvent): void {
      // Walk up to find element id
      let target = e.target as HTMLElement | null
      let elementId: string | undefined
      while (target && target !== pageWrapperRef.value) {
        const id = target.dataset?.elementId
        if (id) {
          elementId = id
          break
        }
        target = target.parentElement
      }
      ctx.contextMenu.show(e, elementId)
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

    function getPageWrapperPadding(wrapper: HTMLElement): { x: number, y: number } {
      const styles = getComputedStyle(wrapper)
      return {
        x: Number.parseFloat(styles.paddingLeft) || 0,
        y: Number.parseFloat(styles.paddingTop) || 0,
      }
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
      const unit = ctx.engine.schema.schema.page.unit
      const zoom = ctx.canvas.zoom.value
      const margins = ctx.engine.schema.schema.page.margins
      const padding = getPageWrapperPadding(wrapper)
      const rect = wrapper.getBoundingClientRect()
      ctx.marquee.startMarquee(
        e,
        rect.left + padding.x + toPixels(margins.left, unit, 96, zoom),
        rect.top + padding.y + toPixels(margins.top, unit, 96, zoom),
      )
    }

    // ── 数据绑定拖放 ──

    function onPageDragover(e: DragEvent): void {
      if (e.dataTransfer?.types.includes('application/easyink-binding')
        || e.dataTransfer?.types.includes('application/easyink-material')) {
        e.preventDefault()
        e.dataTransfer.dropEffect = e.dataTransfer.types.includes('application/easyink-material') ? 'copy' : 'link'
      }
    }

    function onPageDrop(e: DragEvent): void {
      // 处理物料拖放
      const materialRaw = e.dataTransfer?.getData('application/easyink-material')
      if (materialRaw) {
        e.preventDefault()
        _handleMaterialDrop(materialRaw, e)
        return
      }

      // 处理数据绑定拖放
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

      // Find target material
      let target = e.target as HTMLElement | null
      while (target && target !== renderTargetRef.value) {
        const id = target.dataset?.elementId
        if (id) {
          const el = ctx.engine.schema.getMaterialById(id)
          if (el) {
            const cmd = createUpdateBindingCommand({
              materialId: id,
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

    function _handleMaterialDrop(raw: string, e: DragEvent): void {
      let data: { type: string }
      try {
        data = JSON.parse(raw)
      }
      catch {
        return
      }

      const def = ctx.engine.materialRegistry.get(data.type)
      if (!def) {
        return
      }

      // 计算放置坐标
      const wrapper = pageWrapperRef.value
      if (!wrapper) {
        return
      }
      const wrapperRect = wrapper.getBoundingClientRect()
      const _unit = ctx.engine.schema.schema.page.unit
      const zoom = ctx.canvas.zoom.value
      const padding = getPageWrapperPadding(wrapper)
      const _dpi = 96

      const dropX = (e.clientX - wrapperRect.left - padding.x) / zoom
      const dropY = (e.clientY - wrapperRect.top - padding.y) / zoom

      const defaultWidth = (def.defaultLayout.width as number) ?? 100
      const defaultHeight = (def.defaultLayout.height as number) ?? 60

      const material: MaterialNode = {
        id: generateId(),
        layout: {
          height: defaultHeight,
          position: def.defaultLayout.position ?? 'absolute',
          width: defaultWidth,
          x: dropX - defaultWidth / 2,
          y: dropY - defaultHeight / 2,
          ...def.defaultLayout,
          // 覆盖位置为实际放置点
          ...(def.defaultLayout.position !== 'flow'
            ? {
                x: dropX - defaultWidth / 2,
                y: dropY - defaultHeight / 2,
              }
            : {}),
        },
        props: { ...def.defaultProps },
        style: { ...def.defaultStyle },
        type: def.type,
      }

      ctx.addMaterial(material.type, material)
    }

    return () => {
      const marqueeRect = ctx.marquee.marqueeRect.value
      const page = ctx.engine.schema.schema.page
      const unit = page.unit
      const zoom = ctx.canvas.zoom.value
      const wrapperPadding = pageWrapperRef.value ? getPageWrapperPadding(pageWrapperRef.value) : { x: 0, y: 0 }
      const marginLeft = toPixels(page.margins.left, unit, 96, zoom)
      const marginTop = toPixels(page.margins.top, unit, 96, zoom)

      // Marquee overlay (in page coordinates)
      const marqueeDiv = marqueeRect
        ? h('div', {
            class: 'easyink-marquee',
            style: {
              height: `${toPixels(marqueeRect.height, unit, 96, zoom)}px`,
              left: `${wrapperPadding.x + marginLeft + toPixels(marqueeRect.x, unit, 96, zoom)}px`,
              top: `${wrapperPadding.y + marginTop + toPixels(marqueeRect.y, unit, 96, zoom)}px`,
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
            }, [
              h('div', {
                class: 'easyink-canvas-page-wrapper',
                onClick: onCanvasClick,
                onContextmenu,
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
