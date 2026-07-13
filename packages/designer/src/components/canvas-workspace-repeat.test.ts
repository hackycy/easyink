/**
 * @vitest-environment happy-dom
 */
import type { MaterialManifest } from '@easyink/core'
import { defineMaterialManifest } from '@easyink/core'
import { createTestCompiledMaterialProfile, createTestMaterialManifest } from '@easyink/core/testing'
import { afterEach, describe, expect, it } from 'vitest'
import { createApp, defineComponent, h, nextTick } from 'vue'
import { provideDesignerStore } from '../composables'
import { DesignerStore } from '../store/designer-store'
import CanvasWorkspace from './CanvasWorkspace.vue'

afterEach(() => {
  document.body.innerHTML = ''
})

describe('canvas workspace page repeat policy', () => {
  it('creates repeat previews only from the compiled material manifest', async () => {
    const profile = createTestCompiledMaterialProfile([
      manifest('manifest-repeat', 'every-output-page'),
      manifest('ordinary', 'none'),
      manifest('legacy-repeat', 'none'),
    ])
    const manifestRepeat = profile.createNode('manifest-repeat', { id: 'manifest-repeat', y: 10 })
    const ordinary = profile.createNode('ordinary', { id: 'ordinary', y: 20 })
    const legacyRepeat = profile.createNode('legacy-repeat', {
      id: 'legacy-repeat',
      y: 30,
      output: { visibility: 'include', repeat: { scope: 'every-output-page' } },
    })
    const store = new DesignerStore({
      page: {
        mode: 'fixed',
        width: 100,
        height: 100,
        pageModel: { kind: 'paged-paper', paper: { width: 100, height: 100 } },
        pagination: { strategy: 'fixed-sheets', pageCount: 2 },
      },
      elements: [manifestRepeat, ordinary, legacyRepeat],
    }, undefined, undefined, { materials: { profile } })
    const host = document.createElement('div')
    document.body.appendChild(host)
    const app = createApp(defineComponent({
      setup() {
        provideDesignerStore(store)
        return () => h(CanvasWorkspace)
      },
    }))

    app.mount(host)
    await nextTick()

    expect(host.querySelectorAll('.ei-canvas-element--repeat-preview')).toHaveLength(1)
    expect(host.querySelectorAll('.ei-canvas-element:not(.ei-canvas-element--repeat-preview)')).toHaveLength(3)

    app.unmount()
    store.destroy()
  })
})

function manifest(type: string, pageRepeat: 'none' | 'every-output-page'): MaterialManifest {
  const base = createTestMaterialManifest({ type, designer: true })
  return defineMaterialManifest({
    ...base,
    common: {
      ...base.common,
      layout: { ...base.common.layout, pageRepeat },
    },
  })
}
