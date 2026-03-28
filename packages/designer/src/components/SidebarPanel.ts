import type { DesignerContext } from '../types'
import { defineComponent, h, inject, ref } from 'vue'
import { DESIGNER_INJECTION_KEY } from '../types'
import { DataSourcePanel } from './DataSourcePanel'
import { LayerPanel } from './LayerPanel'

export const SidebarPanel = defineComponent({
  name: 'SidebarPanel',
  setup() {
    const ctx = inject(DESIGNER_INJECTION_KEY) as DesignerContext
    const activeTab = ref<'dataSource' | 'layers'>('layers')

    return () => {
      const t = ctx.locale.t

      return h('div', { class: 'easyink-sidebar' }, [
        h('div', { class: 'easyink-sidebar__tabs' }, [
          h('button', {
            class: `easyink-sidebar__tab ${activeTab.value === 'layers' ? 'easyink-sidebar__tab--active' : ''}`,
            onClick: () => { activeTab.value = 'layers' },
          }, t('sidebar.layers')),
          h('button', {
            class: `easyink-sidebar__tab ${activeTab.value === 'dataSource' ? 'easyink-sidebar__tab--active' : ''}`,
            onClick: () => { activeTab.value = 'dataSource' },
          }, t('sidebar.dataSource')),
        ]),
        h('div', { class: 'easyink-sidebar__content' }, [
          activeTab.value === 'layers' ? h(LayerPanel) : h(DataSourcePanel),
        ]),
      ])
    }
  },
})
