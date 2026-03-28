import { defineComponent, h, inject } from 'vue'
import { DESIGNER_INJECTION_KEY } from '../types'

export const ToolbarPanel = defineComponent({
  name: 'ToolbarPanel',
  setup() {
    const ctx = inject(DESIGNER_INJECTION_KEY)!

    return () => {
      const types = ctx.elementTypes.value

      const elementButtons = types.map(def =>
        h('button', {
          class: 'easyink-toolbar-btn',
          key: def.type,
          title: def.name,
          onClick: () => ctx.addElement(def.type),
        }, [
          h('span', { class: 'easyink-toolbar-btn__label' }, ctx.locale.t(`toolbar.${def.type}`) || def.name),
        ]),
      )

      return h('div', { class: 'easyink-toolbar' }, [
        h('div', { class: 'easyink-toolbar-group' }, elementButtons),
        h('div', { class: 'easyink-toolbar-divider' }),
        h('div', { class: 'easyink-toolbar-group' }, [
          h('button', {
            class: 'easyink-toolbar-btn',
            disabled: !ctx.canUndo.value,
            title: ctx.locale.t('toolbar.undo'),
            onClick: () => ctx.undo(),
          }, ctx.locale.t('toolbar.undo')),
          h('button', {
            class: 'easyink-toolbar-btn',
            disabled: !ctx.canRedo.value,
            title: ctx.locale.t('toolbar.redo'),
            onClick: () => ctx.redo(),
          }, ctx.locale.t('toolbar.redo')),
          h('button', {
            class: 'easyink-toolbar-btn',
            disabled: !ctx.selection.selectedElement.value,
            title: ctx.locale.t('toolbar.delete'),
            onClick: () => ctx.removeSelected(),
          }, ctx.locale.t('toolbar.delete')),
        ]),
      ])
    }
  },
})
