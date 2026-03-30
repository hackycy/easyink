import type { DesignerContext } from '../types'
import { defineComponent, h, inject, ref } from 'vue'
import { DESIGNER_INJECTION_KEY } from '../types'
import { DataSourcePanel } from './DataSourcePanel'
import { LayerPanel } from './LayerPanel'
import { PageSettingsPanel } from './PageSettingsPanel'

export const SidebarPanel = defineComponent({
  name: 'SidebarPanel',
  setup() {
    const ctx = inject(DESIGNER_INJECTION_KEY) as DesignerContext
    const activeTab = ref<'dataSource' | 'layers' | 'page'>('layers')

    function renderContent() {
      switch (activeTab.value) {
        case 'page':
          return h(PageSettingsPanel)
        case 'dataSource':
          return h(DataSourcePanel)
        default:
          return h(LayerPanel)
      }
    }

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
          h('button', {
            class: `easyink-sidebar__tab ${activeTab.value === 'page' ? 'easyink-sidebar__tab--active' : ''}`,
            onClick: () => { activeTab.value = 'page' },
          }, t('sidebar.page')),
        ]),
        h('div', { class: 'easyink-sidebar__content' }, [
          renderContent(),
        ]),
      ])
    }
  },
})
