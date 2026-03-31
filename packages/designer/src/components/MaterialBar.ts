import type { MaterialTypeDefinition } from '@easyink/core'
import { defineComponent, h, inject } from 'vue'
import { DESIGNER_INJECTION_KEY } from '../types'

export const MaterialBar = defineComponent({
  name: 'MaterialBar',
  setup() {
    const ctx = inject(DESIGNER_INJECTION_KEY)!

    function onDragStart(def: MaterialTypeDefinition, e: DragEvent): void {
      e.dataTransfer?.setData('application/easyink-material', JSON.stringify({ type: def.type }))
      e.dataTransfer!.effectAllowed = 'copy'

      // 自定义 ghost 预览
      const ghost = document.createElement('div')
      ghost.className = 'easyink-material-drag-ghost'
      ghost.textContent = def.name
      ghost.style.cssText = 'position:fixed;left:-9999px;top:-9999px;padding:4px 12px;background:var(--ei-bg-elevated, #fff);border:1px solid var(--ei-border, #d9d9d9);border-radius:4px;font-size:12px;opacity:0.85;pointer-events:none;z-index:9999;'
      document.body.appendChild(ghost)
      e.dataTransfer!.setDragImage(ghost, 0, 0)
      requestAnimationFrame(() => {
        document.body.removeChild(ghost)
      })
    }

    function onClick(def: MaterialTypeDefinition): void {
      ctx.addMaterial(def.type)
    }

    function renderMaterialCard(def: MaterialTypeDefinition) {
      return h('div', {
        class: 'easyink-material-card',
        draggable: true,
        key: def.type,
        title: def.name,
        onClick: () => onClick(def),
        onDragstart: (e: DragEvent) => onDragStart(def, e),
      }, [
        h('span', { class: 'easyink-material-card__icon' }, def.icon),
        h('span', { class: 'easyink-material-card__name' }, def.name),
      ])
    }

    return () => {
      const t = ctx.locale.t
      const materialTypes = ctx.materialTypes.value
      const categories = new Map<string, MaterialTypeDefinition[]>()

      for (const def of materialTypes) {
        const cat = def.category ?? t('materialBar.uncategorized')
        if (!categories.has(cat)) {
          categories.set(cat, [])
        }
        categories.get(cat)!.push(def)
      }

      const groups: ReturnType<typeof h>[] = []
      for (const [category, defs] of categories) {
        groups.push(
          h('div', { class: 'easyink-material-group', key: category }, [
            categories.size > 1
              ? h('div', { class: 'easyink-material-group__title' }, category)
              : null,
            h('div', { class: 'easyink-material-group__cards' }, defs.map(def => renderMaterialCard(def))),
          ]),
        )
      }

      return h('div', { class: 'easyink-material-bar' }, [
        h('div', { class: 'easyink-material-bar__header' }, t('materialBar.title')),
        h('div', { class: 'easyink-material-bar__body' }, groups),
      ])
    }
  },
})
