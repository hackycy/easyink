/**
 * @vitest-environment happy-dom
 */
import type { MaterialNode } from '@easyink/schema'
import { createTestMaterialManifest } from '@easyink/core/testing'
import { describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick } from 'vue'
import CanvasElementContent from './components/CanvasElementContent.vue'
import { provideDesignerStore } from './composables'
import { builtinCatalogGroupLabels, builtinMaterialIcons, resolveBuiltinMaterialIcon } from './material-host'
import { DesignerStore } from './store/designer-store'
import { createDesignerTestManifest, createDesignerTestProfile } from './testing/material-profile'

describe('designer builtin material host metadata', () => {
  it('owns every builtin icon and catalog label outside the manifest package', () => {
    expect(Object.keys(builtinMaterialIcons).sort()).toEqual([
      'barcode',
      'chart-bar',
      'chart-custom',
      'chart-gauge',
      'chart-line',
      'chart-pie',
      'chart-radar',
      'chart-scatter',
      'ellipse',
      'flow-row',
      'image',
      'line',
      'page-number',
      'progress',
      'qrcode',
      'rating',
      'rect',
      'ring-progress',
      'signature',
      'svg-custom',
      'svg-heart',
      'svg-star',
      'table',
      'table-data',
      'text',
    ])
    expect(builtinCatalogGroupLabels).toEqual({
      basic: 'materials.catalog.basic',
      data: 'materials.catalog.data',
      chart: 'materials.catalog.chart',
      svg: 'materials.catalog.svg',
      utility: 'materials.catalog.utility',
    })
  })

  it('resolves host icons and uses the rectangle icon as a stable fallback', () => {
    expect(resolveBuiltinMaterialIcon('image')).toBe(builtinMaterialIcons.image)
    expect(resolveBuiltinMaterialIcon('host-unknown')).toBe(builtinMaterialIcons.rect)
  })
})

describe('designerStore material facet host', () => {
  it('activates and peeks a designer facet while excluding viewer-only types', async () => {
    const extension = { renderContent: vi.fn(() => () => {}) }
    const profile = createDesignerTestProfile([
      createDesignerTestManifest({ type: 'editable', extension }),
      createTestMaterialManifest({ type: 'viewer-only', designer: false }),
    ])
    const store = new DesignerStore(undefined, undefined, undefined, { materials: { profile } })

    expect(store.peekDesignerFacet('editable')).toBeUndefined()
    await expect(store.activateDesignerFacet('editable')).resolves.toMatchObject({ state: 'active', value: { extension } })
    expect(store.peekDesignerFacet('editable')?.value?.extension).toBe(extension)
    expect(store.listEditableMaterialTypes()).toEqual(['editable'])
  })

  it('quarantines preparation failures without caching a usable value', async () => {
    const profile = createDesignerTestProfile([
      createDesignerTestManifest({ type: 'broken', designerFactory: () => { throw new Error('prepare failed') } }),
    ])
    const store = new DesignerStore(undefined, undefined, undefined, { materials: { profile } })

    const instance = await store.activateDesignerFacet('broken')

    expect(instance).toMatchObject({ state: 'quarantined', diagnostic: { code: 'MATERIAL_FACET_ACTIVATION_FAILED' } })
    expect(instance.value).toBeUndefined()
    expect(store.peekDesignerFacet('broken')).toBe(instance)
  })

  it('runs render cleanup on unmount and extension disposal once', async () => {
    const renderCleanup = vi.fn()
    const dispose = vi.fn()
    const extension = { renderContent: vi.fn(() => renderCleanup), dispose }
    const profile = createDesignerTestProfile([createDesignerTestManifest({ type: 'editable', extension })])
    const store = new DesignerStore({ elements: [node('editable')] }, undefined, undefined, { materials: { profile } })
    const host = document.createElement('div')
    document.body.appendChild(host)
    const app = createApp(defineComponent({
      setup() {
        provideDesignerStore(store)
        return () => h(CanvasElementContent, { nodeId: 'editable' })
      },
    }))

    app.mount(host)
    await flush()
    expect(extension.renderContent).toHaveBeenCalledOnce()

    app.unmount()
    expect(renderCleanup).toHaveBeenCalledOnce()
    store.destroy()
    await flush()
    expect(dispose).toHaveBeenCalledOnce()
    host.remove()
  })
})

function node(id: string): MaterialNode {
  return {
    id,
    type: 'editable',
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    modelVersion: 1,
    model: {},
    slots: {},
    bindings: {},
    output: { visibility: 'include' },
  }
}

async function flush() {
  await Promise.resolve()
  await Promise.resolve()
  await new Promise(resolve => setTimeout(resolve, 0))
  await nextTick()
}
