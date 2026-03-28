import type { DesignerContext } from '../types'
import {
  createReorderElementCommand,
  createToggleLockCommand,
  createToggleVisibilityCommand,
} from '@easyink/core'
import { defineComponent, h, inject } from 'vue'
import { DESIGNER_INJECTION_KEY } from '../types'

export const LayerPanel = defineComponent({
  name: 'LayerPanel',
  setup() {
    const ctx = inject(DESIGNER_INJECTION_KEY) as DesignerContext

    function toggleVisibility(id: string): void {
      const el = ctx.engine.schema.getElementById(id)
      if (!el) {
        return
      }
      const cmd = createToggleVisibilityCommand({
        elementId: id,
        newHidden: !el.hidden,
        oldHidden: !!el.hidden,
      }, ctx.engine.operations)
      ctx.engine.execute(cmd)
    }

    function toggleLock(id: string): void {
      const el = ctx.engine.schema.getElementById(id)
      if (!el) {
        return
      }
      const cmd = createToggleLockCommand({
        elementId: id,
        newLocked: !el.locked,
        oldLocked: !!el.locked,
      }, ctx.engine.operations)
      ctx.engine.execute(cmd)
    }

    function onItemClick(id: string, e: MouseEvent): void {
      if (e.shiftKey) {
        ctx.selection.toggleSelect(id)
      }
      else {
        ctx.selection.select(id)
      }
    }

    function onDragStart(id: string, e: DragEvent): void {
      e.dataTransfer?.setData('application/easyink-layer', id)
      e.dataTransfer!.effectAllowed = 'move'
    }

    function onDragOver(e: DragEvent): void {
      if (e.dataTransfer?.types.includes('application/easyink-layer')) {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
      }
    }

    function onDrop(index: number, e: DragEvent): void {
      e.preventDefault()
      const elementId = e.dataTransfer?.getData('application/easyink-layer')
      if (!elementId) {
        return
      }
      const elements = ctx.engine.schema.schema.elements
      const oldIndex = elements.findIndex(el => el.id === elementId)
      if (oldIndex === -1 || oldIndex === index) {
        return
      }

      const cmd = createReorderElementCommand({
        elementId,
        newIndex: index,
        oldIndex,
      }, ctx.engine.operations)
      ctx.engine.execute(cmd)
    }

    return () => {
      const elements = ctx.engine.schema.schema.elements
      const t = ctx.locale.t

      if (elements.length === 0) {
        return h('div', { class: 'easyink-layer-panel' }, [
          h('div', { class: 'easyink-layer-panel__empty' }, t('layer.empty')),
        ])
      }

      // Display in reverse order (topmost first)
      const reversed = [...elements].reverse()

      return h('div', { class: 'easyink-layer-panel' }, reversed.map((el, visualIndex) => {
        const realIndex = elements.length - 1 - visualIndex
        const isSelected = ctx.selection.isSelected(el.id)
        const classes = [
          'easyink-layer-item',
          isSelected ? 'easyink-layer-item--selected' : '',
          el.hidden ? 'easyink-layer-item--hidden' : '',
          el.locked ? 'easyink-layer-item--locked' : '',
        ].filter(Boolean).join(' ')

        return h('div', {
          class: classes,
          draggable: true,
          key: el.id,
          onClick: (e: MouseEvent) => onItemClick(el.id, e),
          onDragover: onDragOver,
          onDragstart: (e: DragEvent) => onDragStart(el.id, e),
          onDrop: (e: DragEvent) => onDrop(realIndex, e),
        }, [
          h('span', { class: 'easyink-layer-item__type' }, el.type),
          h('span', { class: 'easyink-layer-item__name' }, el.name ?? el.id),
          h('div', { class: 'easyink-layer-item__actions' }, [
            h('button', {
              class: `easyink-layer-item__btn ${el.hidden ? 'easyink-layer-item__btn--active' : ''}`,
              onClick: (e: MouseEvent) => {
                e.stopPropagation()
                toggleVisibility(el.id)
              },
              title: t('layer.visibility'),
            }, el.hidden ? '👁‍🗨' : '👁'),
            h('button', {
              class: `easyink-layer-item__btn ${el.locked ? 'easyink-layer-item__btn--active' : ''}`,
              onClick: (e: MouseEvent) => {
                e.stopPropagation()
                toggleLock(el.id)
              },
              title: t('layer.lock'),
            }, el.locked ? '🔒' : '🔓'),
          ]),
        ])
      }))
    }
  },
})
