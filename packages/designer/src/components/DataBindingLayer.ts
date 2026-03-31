import { createUpdateBindingCommand } from '@easyink/core'
import { computed, defineComponent, h, inject } from 'vue'
import { DESIGNER_INJECTION_KEY } from '../types'

export const DataBindingLayer = defineComponent({
  name: 'DataBindingLayer',
  setup() {
    const ctx = inject(DESIGNER_INJECTION_KEY)!

    const boundMaterials = computed(() => {
      const renderVersion = ctx.canvas.renderVersion.value
      void renderVersion
      return ctx.engine.schema.schema.materials.filter(m => m.binding?.path)
    })

    function getElementPosition(id: string): { height: number, width: number, x: number, y: number } | null {
      const wrapper = document.querySelector('.easyink-canvas-page-wrapper') as HTMLElement | null
      if (!wrapper) {
        return null
      }

      const element = Array.from(wrapper.querySelectorAll('.easyink-element'))
        .find(node => (node as HTMLElement).dataset.materialId === id) as HTMLElement | undefined
      if (!element) {
        return null
      }

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

    function removeBinding(id: string): void {
      const el = ctx.engine.schema.getMaterialById(id)
      if (!el) {
        return
      }
      const cmd = createUpdateBindingCommand({
        materialId: id,
        newBinding: undefined,
        oldBinding: el.binding ? { ...el.binding } : undefined,
      }, ctx.engine.operations)
      ctx.engine.execute(cmd)
    }

    function onDragOver(e: DragEvent): void {
      if (e.dataTransfer?.types.includes('application/easyink-binding')) {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'link'
      }
    }

    function onDrop(materialId: string, e: DragEvent): void {
      const raw = e.dataTransfer?.getData('application/easyink-binding')
      if (!raw) {
        return
      }
      e.preventDefault()
      e.stopPropagation()

      let binding: { path: string }
      try {
        binding = JSON.parse(raw)
      }
      catch {
        return
      }

      const el = ctx.engine.schema.getMaterialById(materialId)
      if (!el) {
        return
      }

      const cmd = createUpdateBindingCommand({
        materialId,
        newBinding: { path: binding.path },
        oldBinding: el.binding ? { ...el.binding } : undefined,
      }, ctx.engine.operations)
      ctx.engine.execute(cmd)
    }

    return () => {
      const materials = boundMaterials.value
      if (materials.length === 0) {
        return null
      }

      const labels: ReturnType<typeof h>[] = []

      for (const m of materials) {
        const pos = getElementPosition(m.id)
        if (!pos || !m.binding?.path) {
          continue
        }

        labels.push(
          h('div', {
            class: 'easyink-binding-label',
            key: m.id,
            style: {
              left: `${pos.x}px`,
              top: `${pos.y - 20}px`,
            },
            onDragover: onDragOver,
            onDrop: (e: DragEvent) => onDrop(m.id, e),
          }, [
            h('span', { class: 'easyink-binding-label__path' }, `{{${m.binding.path}}}`),
            h('button', {
              class: 'easyink-binding-label__remove',
              title: ctx.locale.t('dataBinding.remove'),
              onClick: (e: MouseEvent) => {
                e.stopPropagation()
                removeBinding(m.id)
              },
            }, 'x'),
          ]),
        )
      }

      return h('div', { class: 'easyink-data-binding-layer' }, labels)
    }
  },
})
