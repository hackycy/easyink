import type { DesignerContext } from '../types'
import {
  createReorderMaterialCommand,
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
      const el = ctx.engine.schema.getMaterialById(id)
      if (!el) {
        return
      }
      const cmd = createToggleVisibilityCommand({
        materialId: id,
        newHidden: !el.hidden,
        oldHidden: !!el.hidden,
      }, ctx.engine.operations)
      ctx.engine.execute(cmd)
    }

    function toggleLock(id: string): void {
      const el = ctx.engine.schema.getMaterialById(id)
      if (!el) {
        return
      }
      const cmd = createToggleLockCommand({
        materialId: id,
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
      const materialId = e.dataTransfer?.getData('application/easyink-layer')
      if (!materialId) {
        return
      }
      const materials = ctx.engine.schema.schema.materials
      const oldIndex = materials.findIndex(el => el.id === materialId)
      if (oldIndex === -1 || oldIndex === index) {
        return
      }

      const cmd = createReorderMaterialCommand({
        materialId,
        newIndex: index,
        oldIndex,
      }, ctx.engine.operations)
      ctx.engine.execute(cmd)
    }

    return () => {
      const materials = ctx.engine.schema.schema.materials
      const t = ctx.locale.t

      if (materials.length === 0) {
        return h('div', { class: 'easyink-layer-panel' }, [
          h('div', { class: 'easyink-layer-panel__empty' }, t('layer.empty')),
        ])
      }

      // Display in reverse order (topmost first)
      const reversed = [...materials].reverse()

      return h('div', { class: 'easyink-layer-panel' }, reversed.map((el, visualIndex) => {
        const realIndex = materials.length - 1 - visualIndex
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
            }, el.hidden ? 'H' : 'V'),
            h('button', {
              class: `easyink-layer-item__btn ${el.locked ? 'easyink-layer-item__btn--active' : ''}`,
              onClick: (e: MouseEvent) => {
                e.stopPropagation()
                toggleLock(el.id)
              },
              title: t('layer.lock'),
            }, el.locked ? 'L' : 'U'),
          ]),
        ])
      }))
    }
  },
})
