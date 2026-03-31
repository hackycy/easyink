import { computed, defineComponent, h, inject } from 'vue'
import { DESIGNER_INJECTION_KEY } from '../types'

export const ToolbarPanel = defineComponent({
  name: 'ToolbarPanel',
  setup() {
    const ctx = inject(DESIGNER_INJECTION_KEY)!

    const selectedCount = computed(() => ctx.selection.selectedIds.value.length)

    return () => {
      const t = ctx.locale.t

      const alignButtons: ReturnType<typeof h>[] = []

      // Show alignment buttons when >=2 selected
      if (selectedCount.value >= 2) {
        alignButtons.push(
          h('div', { class: 'easyink-toolbar-divider', key: 'align-divider' }),
          h('div', { class: 'easyink-toolbar-group', key: 'align-group' }, [
            h('button', {
              class: 'easyink-toolbar-btn',
              title: t('toolbar.alignLeft'),
              onClick: () => ctx.batchOperations.alignLeft(),
            }, t('toolbar.alignLeft')),
            h('button', {
              class: 'easyink-toolbar-btn',
              title: t('toolbar.alignHCenter'),
              onClick: () => ctx.batchOperations.alignHCenter(),
            }, t('toolbar.alignHCenter')),
            h('button', {
              class: 'easyink-toolbar-btn',
              title: t('toolbar.alignRight'),
              onClick: () => ctx.batchOperations.alignRight(),
            }, t('toolbar.alignRight')),
            h('button', {
              class: 'easyink-toolbar-btn',
              title: t('toolbar.alignTop'),
              onClick: () => ctx.batchOperations.alignTop(),
            }, t('toolbar.alignTop')),
            h('button', {
              class: 'easyink-toolbar-btn',
              title: t('toolbar.alignVCenter'),
              onClick: () => ctx.batchOperations.alignVCenter(),
            }, t('toolbar.alignVCenter')),
            h('button', {
              class: 'easyink-toolbar-btn',
              title: t('toolbar.alignBottom'),
              onClick: () => ctx.batchOperations.alignBottom(),
            }, t('toolbar.alignBottom')),
          ]),
        )
      }

      // Show distribute buttons when >=3 selected
      if (selectedCount.value >= 3) {
        alignButtons.push(
          h('div', { class: 'easyink-toolbar-group', key: 'dist-group' }, [
            h('button', {
              class: 'easyink-toolbar-btn',
              title: t('toolbar.distributeH'),
              onClick: () => ctx.batchOperations.distributeHorizontal(),
            }, t('toolbar.distributeH')),
            h('button', {
              class: 'easyink-toolbar-btn',
              title: t('toolbar.distributeV'),
              onClick: () => ctx.batchOperations.distributeVertical(),
            }, t('toolbar.distributeV')),
          ]),
        )
      }

      return h('div', { class: 'easyink-toolbar' }, [
        h('div', { class: 'easyink-toolbar-group' }, [
          h('button', {
            class: 'easyink-toolbar-btn',
            disabled: !ctx.canUndo.value,
            title: t('toolbar.undo'),
            onClick: () => ctx.undo(),
          }, t('toolbar.undo')),
          h('button', {
            class: 'easyink-toolbar-btn',
            disabled: !ctx.canRedo.value,
            title: t('toolbar.redo'),
            onClick: () => ctx.redo(),
          }, t('toolbar.redo')),
          h('button', {
            class: 'easyink-toolbar-btn',
            disabled: selectedCount.value === 0,
            title: t('toolbar.delete'),
            onClick: () => ctx.removeSelected(),
          }, t('toolbar.delete')),
        ]),
        ...alignButtons,
      ])
    }
  },
})
