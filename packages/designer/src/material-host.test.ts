/**
 * @vitest-environment happy-dom
 */
import type { MaterialNode } from '@easyink/schema'
import { createTestMaterialManifest } from '@easyink/core/testing'
import { describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick } from 'vue'
import { compileBuiltinMaterialProfile } from '../../builtin/src'
import CanvasElementContent from './components/CanvasElementContent.vue'
import { provideDesignerStore } from './composables'
import { builtinMaterialGroupLabels, builtinMaterialIcons, resolveBuiltinMaterialIcon } from './material-host'
import { DesignerStore } from './store/designer-store'
import { createDesignerTestManifest, createDesignerTestProfile } from './testing/material-profile'

describe('designer builtin material host metadata', () => {
  it('owns every builtin icon and material group label outside the manifest package', () => {
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
    expect(builtinMaterialGroupLabels).toEqual({
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

  it('lets runtime icons override builtins while keeping the deterministic fallback', () => {
    const customImage = defineComponent({ name: 'HostImageIcon' })
    const runtimeConfig = Object.freeze({
      materials: Object.freeze({ icons: Object.freeze({ image: customImage }) }),
    })
    const store = new DesignerStore(undefined, undefined, undefined, runtimeConfig)

    expect(store.resolveMaterialIcon('image')).toBe(customImage)
    expect(store.resolveMaterialIcon('missing')).toBe(builtinMaterialIcons.rect)
  })
})

describe('designerStore material facet host', () => {
  it('provides the shared transaction and designer host services lazily', async () => {
    let activationServices: unknown
    const manifest = createTestMaterialManifest({
      type: 'services',
      designer: (context) => {
        activationServices = context.services
        return {
          extension: { renderContent: () => () => {} },
          catalog: { group: 'test', order: 0 },
        }
      },
    })
    const profile = createDesignerTestProfile([manifest])
    const icon = defineComponent({ name: 'HostServiceIcon' })
    const runtimeConfig = { materials: { profile, icons: { service: icon } } }
    const store = new DesignerStore(undefined, undefined, undefined, runtimeConfig)

    expect(activationServices).toBeUndefined()
    await store.activateDesignerFacet('services')

    expect(activationServices).toMatchObject({
      tx: store.materialTransaction,
      propertyEditorRegistry: store.propertyEditorRegistry,
      runtimeConfig,
    })
    const services = activationServices as {
      registerLocaleMessages: unknown
      resolveMaterialIcon: (key: string) => unknown
    }
    expect(services.registerLocaleMessages).toEqual(expect.any(Function))
    expect(services.resolveMaterialIcon('service')).toBe(icon)
  })

  it('activates real builtin text and flow-row facets with live extension services', async () => {
    const profile = compileBuiltinMaterialProfile('basic')
    const flow = profile.createNode('flow-row', { id: 'flow' })
    const text = profile.createNode('text', { id: 'text' })
    const store = new DesignerStore({ elements: [flow, text] }, undefined, undefined, { materials: { profile } })

    const [textFacet, flowFacet] = await Promise.all([
      store.activateDesignerFacet('text'),
      store.activateDesignerFacet('flow-row'),
    ])

    expect(textFacet.state).toBe('active')
    expect(flowFacet.state).toBe('active')
    expect(store.peekDesignerFacet('text')).toBe(textFacet)
    expect(store.peekDesignerFacet('flow-row')).toBe(flowFacet)

    const liveFlow = store.getElementById('flow')!
    flowFacet.value!.extension.datasourceDrop!.onDrop(
      { sourceId: 'orders', fieldPath: 'items/name', fieldLabel: 'Name' },
      { x: 1, y: 1 },
      liveFlow,
    )
    expect(Object.keys(liveFlow.bindings)).toContainEqual(expect.stringMatching(/^column:/))
    expect(store.documentTransactions.canUndo).toBe(true)
    store.destroy()
  })

  it('registers builtin facet locale metadata once and releases it per store lifecycle', async () => {
    const profile = compileBuiltinMaterialProfile('basic')
    const first = new DesignerStore(undefined, undefined, undefined, { materials: { profile } })
    const second = new DesignerStore(undefined, undefined, undefined, { materials: { profile } })
    first.setLocale({}, 'en-US')
    second.setLocale({}, 'en-US')

    expect(first.t('materials.text.name')).toBe('materials.text.name')
    const [firstActivation, concurrentActivation] = await Promise.all([
      first.activateDesignerFacet('text'),
      first.activateDesignerFacet('text'),
    ])
    expect(firstActivation).toBe(concurrentActivation)
    expect(first.t('materials.text.name')).toBe('Text')

    await second.activateDesignerFacet('text')
    expect(second.t('materials.text.name')).toBe('Text')

    await firstActivation.dispose()
    expect(first.t('materials.text.name')).toBe('materials.text.name')
    expect(first.peekDesignerFacet('text')).toBeUndefined()
    expect(second.t('materials.text.name')).toBe('Text')

    second.destroy()
    expect(second.t('materials.text.name')).toBe('materials.text.name')
  })

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
    expect([...store.materialProfile.editableTypes]).toEqual(['editable'])
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
    expect(store.t('materials.broken.name')).toBe('materials.broken.name')
  })

  it.each([
    ['top-level getter', () => {
      const facet = validFacet() as Record<string, unknown>
      Object.defineProperty(facet, 'localeMessages', { enumerable: true, get: () => {
        throw new Error('getter')
      } })
      return facet
    }],
    ['nested getter', () => {
      const messages: Record<string, unknown> = {}
      Object.defineProperty(messages, 'plugin', { enumerable: true, get: () => {
        throw new Error('nested getter')
      } })
      return { ...validFacet(), localeMessages: { messages } }
    }],
    ['proxy trap', () => ({
      ...validFacet(),
      localeMessages: { messages: new Proxy({}, { ownKeys: () => { throw new Error('proxy') } }) },
    })],
    ['oversize tree', () => ({
      ...validFacet(),
      localeMessages: { messages: { plugin: { title: 'x'.repeat(140_000) } } },
    })],
  ])('quarantines hostile locale metadata (%s) without rejecting activation or breaking t()', async (_label, createFacet) => {
    const manifest = createTestMaterialManifest({ type: 'hostile-locale', designer: () => createFacet() as any })
    const profile = createDesignerTestProfile([manifest])
    const store = new DesignerStore(undefined, undefined, undefined, { materials: { profile } })

    const instance = await store.activateDesignerFacet('hostile-locale')

    expect(instance).toMatchObject({ state: 'quarantined', diagnostic: { code: 'MATERIAL_FACET_ACTIVATION_FAILED' } })
    expect(instance.value).toBeUndefined()
    expect(store.peekDesignerFacet('hostile-locale')).toBe(instance)
    expect(() => store.t('plugin.title')).not.toThrow()
    expect(store.t('plugin.title')).toBe('plugin.title')
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

function validFacet() {
  return {
    extension: { renderContent: () => () => {} },
    catalog: { group: 'test', order: 0 },
  }
}
