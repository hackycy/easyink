/**
 * @vitest-environment happy-dom
 */
import type { MaterialManifest } from '@easyink/core'
import { describe, expect, it } from 'vitest'
import { createApp, defineComponent, h, nextTick, reactive } from 'vue'
import { provideDesignerStore } from '../composables'
import { DesignerStore } from '../store/designer-store'
import { createDesignerTestManifest, createDesignerTestProfile } from '../testing/material-profile'
import MaterialPanel from './MaterialPanel.vue'

describe('materialPanel group labels', () => {
  it('resolves builtin groups, falls back for external groups, and reacts to locale changes', async () => {
    const profile = createDesignerTestProfile([
      manifestWithCategory('text', 'basic'),
      manifestWithCategory('table', 'data'),
      manifestWithCategory('widget', 'custom'),
    ])
    const store = reactive(new DesignerStore(undefined, undefined, undefined, { materials: { profile } })) as DesignerStore
    store.setLocale({
      materials: { catalog: { basic: 'Basic materials', data: 'Data materials' } },
    })
    const host = document.createElement('div')
    document.body.appendChild(host)
    const app = createApp(defineComponent({
      setup() {
        provideDesignerStore(store)
        return () => h(MaterialPanel)
      },
    }))

    app.mount(host)
    expect(groupTitles(host).sort()).toEqual(['Basic materials', 'Data materials', 'custom'])

    store.setLocale({
      materials: { catalog: { basic: 'Basics updated', data: 'Data updated' } },
      custom: 'External materials',
    })
    await nextTick()
    expect(groupTitles(host).sort()).toEqual(['Basics updated', 'Data updated', 'External materials'])

    app.unmount()
    host.remove()
  })
})

function manifestWithCategory(type: string, category: string): MaterialManifest {
  const manifest = createDesignerTestManifest({ type })
  return { ...manifest, common: { ...manifest.common, category } }
}

function groupTitles(host: HTMLElement): string[] {
  return [...host.querySelectorAll<HTMLElement>('.ei-material-panel__section-title')]
    .map(element => element.textContent?.trim() ?? '')
}
