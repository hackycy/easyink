/**
 * @vitest-environment happy-dom
 */
import type { MaterialBindingDefinition } from '@easyink/core'
import type { MaterialNode } from '@easyink/schema'
import type { Component } from 'vue'
import { validateDocumentWithProfile } from '@easyink/core'
import { createTestMaterialManifest } from '@easyink/core/testing'
import { afterEach, describe, expect, it } from 'vitest'
import { createApp, defineComponent, h, nextTick } from 'vue'
import enUS from '../../../locales/src/en-US'
import { provideDesignerStore } from '../composables'
import { DesignerStore } from '../store/designer-store'
import { createDesignerTestProfile } from '../testing/material-profile'
import PropertiesPanel from './PropertiesPanel.vue'

afterEach(() => {
  document.body.innerHTML = ''
})

describe('properties panel canonical binding ports', () => {
  it.each([
    ['text', 'value'],
    ['image', 'src'],
  ])('displays, formats, clears, and restores the exact %s port (%s)', async (type, port) => {
    const profile = profileWith(bindingManifest(type, exactDisplayBinding(port, type === 'image' ? '/model/src' : '/model/content')))
    const node = profile.createNode(type, { id: type })
    node.bindings[port] = { sourceId: 'orders', sourceName: 'Orders', fieldPath: 'customer/name', fieldLabel: 'Customer Name' }
    const store = storeWith(profile, node)
    const liveNode = store.getElementById(type)!
    const mounted = mountWithStore(store, PropertiesPanel)

    expect(mounted.host.textContent).toContain('Orders')
    expect(mounted.host.textContent).toContain('Customer Name')

    configureButton(mounted.host).click()
    await nextTick()
    presetButton(document.body, '1,235').click()
    buttonByText(document.body, 'OK').click()
    await nextTick()
    expect(liveNode.bindings[port]).toMatchObject({ format: { mode: 'preset', preset: { type: 'number', maximumFractionDigits: 0 } } })

    buttonByText(mounted.host, 'Unbind').click()
    expect(liveNode.bindings[port]).toBeUndefined()
    if (port !== 'value')
      expect(liveNode.bindings.value).toBeUndefined()
    store.documentTransactions.undo()
    expect(liveNode.bindings[port]).toBeDefined()
    expect(validateDocumentWithProfile(store.schema, profile).valid).toBe(true)
    mounted.unmount()
  })

  it('renders and edits a data-contract panel on its declared semantic port', async () => {
    const contract = {
      version: 3 as const,
      model: {
        kind: 'tabular' as const,
        fields: {
          value: { labelKey: 'Value', type: 'number' as const, formatEditor: { tabs: ['preset'] as ['preset'] } },
        },
      },
    }
    const binding: MaterialBindingDefinition = {
      kind: 'ports',
      dataContract: contract,
      ports: [{ id: 'data', key: { kind: 'exact', value: 'dataset' }, role: 'semantic', valueShape: 'record-array', formatEditor: false }],
    }
    const profile = profileWith(bindingManifest('chart', binding))
    const node = profile.createNode('chart', { id: 'chart' })
    node.bindings.dataset = {
      kind: 'data-contract',
      mappings: { value: { sourceId: 'sales', sourceName: 'Sales', select: { path: 'rows/amount', label: 'Amount' } } },
    }
    const store = storeWith(profile, node)
    const liveNode = store.getElementById('chart')!
    const mounted = mountWithStore(store, PropertiesPanel)

    expect(mounted.host.textContent).toContain('Sales')
    expect(mounted.host.textContent).toContain('Amount')
    expect(liveNode.bindings.value).toBeUndefined()

    configureButton(mounted.host).click()
    await nextTick()
    presetButton(document.body, '1,235').click()
    buttonByText(document.body, 'OK').click()
    await nextTick()
    expect(liveNode.bindings.dataset).toMatchObject({ mappings: { value: { format: { mode: 'preset', preset: { type: 'number' } } } } })

    buttonByText(mounted.host, 'Clear').click()
    expect(liveNode.bindings.dataset).toBeUndefined()
    store.documentTransactions.undo()
    expect(liveNode.bindings.dataset).toBeDefined()
    expect(validateDocumentWithProfile(store.schema, profile).valid).toBe(true)
    mounted.unmount()
  })

  it('does not render the generic binding panel for prefix-only policies', () => {
    const binding: MaterialBindingDefinition = {
      kind: 'ports',
      ports: [{ id: 'cell', key: { kind: 'prefix', value: 'cell:' }, role: 'display', valueShape: 'scalar', modelPath: '/model/cells', formatEditor: false }],
    }
    const profile = profileWith(bindingManifest('custom', binding))
    const node = profile.createNode('custom', { id: 'custom' })
    const store = storeWith(profile, node)
    const mounted = mountWithStore(store, PropertiesPanel)

    expect(mounted.host.querySelector('.ei-binding-section')).toBeNull()
    mounted.unmount()
  })
})

function exactDisplayBinding(port: string, modelPath: `/${string}`): MaterialBindingDefinition {
  return {
    kind: 'ports',
    ports: [{ id: port, key: { kind: 'exact', value: port }, role: 'display', valueShape: 'scalar', modelPath, formatEditor: { tabs: ['preset'] } }],
  }
}

function bindingManifest(type: string, binding: MaterialBindingDefinition) {
  return createTestMaterialManifest({ type, binding, designer: true })
}

function profileWith(manifest: ReturnType<typeof bindingManifest>) {
  return createDesignerTestProfile([manifest])
}

function storeWith(profile: ReturnType<typeof profileWith>, node: MaterialNode) {
  const store = new DesignerStore({ elements: [node] }, undefined, undefined, { materials: { profile } })
  store.setLocale(enUS)
  store.selection.select(node.id)
  return store
}

function mountWithStore(store: DesignerStore, component: Component) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const app = createApp(defineComponent({
    setup() {
      provideDesignerStore(store)
      return () => h(component)
    },
  }))
  app.mount(host)
  return { host, unmount: () => app.unmount() }
}

function buttonByText(root: ParentNode, text: string): HTMLButtonElement {
  const button = [...root.querySelectorAll<HTMLButtonElement>('button')].find(candidate => candidate.textContent?.trim() === text)
  if (!button)
    throw new Error(`Expected button text: ${text}`)
  return button
}

function configureButton(root: ParentNode): HTMLButtonElement {
  const button = root.querySelector<HTMLButtonElement>('.ei-binding-format-editor__btn')
  if (!button)
    throw new Error('Expected configure format button')
  return button
}

function presetButton(root: ParentNode, label: string): HTMLButtonElement {
  const button = [...root.querySelectorAll<HTMLButtonElement>('.ei-bfd__chip')]
    .find(candidate => candidate.querySelector('.ei-bfd__chip-label')?.textContent?.trim() === label)
  if (!button)
    throw new Error(`Expected preset: ${label}`)
  return button
}
