/**
 * @vitest-environment happy-dom
 */
import type { Component } from 'vue'
import type { DesignerStore } from '../store/designer-store'
import type { DesignerResolvedAsset } from '../types'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick, ref } from 'vue'
import enUS from '../../../locales/src/en-US'
import { provideDesignerStore } from '../composables'
import { DesignerStore as Store } from '../store/designer-store'
import DesignerConfirmHost from './DesignerConfirmHost.vue'
import ImageSourceEditor from './ImageSourceEditor.vue'
import PropertiesPanel from './PropertiesPanel.vue'

const PICK_TITLE = 'Pick Image'
const CLEAR_TITLE = 'Clear Image'

afterEach(() => {
  document.body.innerHTML = ''
})

describe('image source editor', () => {
  it('commits directly typed image sources', async () => {
    const mounted = mountImageSourceEditor()
    const input = textInput(mounted.host)

    input.dispatchEvent(new FocusEvent('focus'))
    input.value = 'https://example.com/direct.png'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new FocusEvent('blur'))
    await nextTick()

    expect(mounted.events.updates).toEqual(['https://example.com/direct.png'])
    expect(mounted.events.commits).toEqual(['https://example.com/direct.png'])
    mounted.unmount()
  })

  it('clears the current image source', async () => {
    const mounted = mountImageSourceEditor({ value: 'https://example.com/old.png' })

    button(mounted.host, CLEAR_TITLE).click()
    await nextTick()

    expect(mounted.events.updates).toContain('')
    expect(mounted.events.commits).toContain('')
    mounted.unmount()
  })

  it('disables typing, picking, and clearing together', async () => {
    const pickAsset = vi.fn(() => ({ url: 'https://example.com/new.png' }))
    const mounted = mountImageSourceEditor({
      value: 'https://example.com/old.png',
      disabled: true,
      provider: { pickAsset },
    })

    expect(textInput(mounted.host).disabled).toBe(true)
    expect(button(mounted.host, PICK_TITLE).disabled).toBe(true)
    expect(button(mounted.host, CLEAR_TITLE).disabled).toBe(true)

    button(mounted.host, PICK_TITLE).click()
    await flush()

    expect(pickAsset).not.toHaveBeenCalled()
    mounted.unmount()
  })

  it('uses the host interaction bridge instead of rendering native inputs', async () => {
    const pickAsset = vi.fn(() => ({ url: 'https://example.com/picked.png', alt: 'Picked' }))
    const mounted = mountImageSourceEditor({
      value: 'https://example.com/old.png',
      provider: { pickAsset },
    })

    expect(mounted.host.querySelector('input[type="file"]')).toBeNull()
    button(mounted.host, PICK_TITLE).click()
    await flush()

    expect(pickAsset).toHaveBeenCalledWith(expect.objectContaining({
      id: 'designer.imageMaterial.pickImage',
      currentUrl: 'https://example.com/old.png',
      accept: ['image/*'],
    }))
    expect(mounted.events.updates).toContain('https://example.com/picked.png')
    expect(mounted.events.picks).toEqual([{ url: 'https://example.com/picked.png', alt: 'Picked' }])
    mounted.unmount()
  })

  it('disables picking before the shell asset provider is mounted', async () => {
    const mounted = mountImageSourceEditor()

    expect(mounted.host.querySelector('input[type="file"]')).toBeNull()
    expect(button(mounted.host, PICK_TITLE).disabled).toBe(true)
    mounted.unmount()
  })
})

describe('designer asset picker host', () => {
  it('registers a default shell file picker and data URL uploader', async () => {
    const store = createStore()
    const mounted = mountWithStore(store, DesignerConfirmHost)

    expect(store.assetPickerAvailable).toBe(true)
    expect(store.hostAssetUploaderAvailable).toBe(false)

    mounted.unmount()
  })
})

describe('properties panel image source writes', () => {
  it('writes picked images into page background without dropping existing background fields', async () => {
    const store = createStore({
      page: {
        mode: 'fixed',
        width: 210,
        height: 297,
        background: {
          color: '#ffffff',
          repeat: 'repeat',
        },
      },
    })
    const pickAsset = vi.fn(() => ({ url: 'https://example.com/background.png' }))
    store.setInteractionProvider({ pickAsset })
    const mounted = mountWithStore(store, PropertiesPanel)

    button(mounted.host, PICK_TITLE).click()
    await flush()

    expect(pickAsset).toHaveBeenCalledWith(expect.objectContaining({
      id: 'designer.pageBackground.pickImage',
      source: 'page-background',
      accept: ['image/*'],
    }))
    expect(store.schema.page.background).toMatchObject({
      color: '#ffffff',
      repeat: 'repeat',
      image: 'https://example.com/background.png',
    })
    mounted.unmount()
  })

  it('writes picked image material src and fills blank alt once', async () => {
    const store = createStore({
      elements: [
        imageNode('img_blank', { src: '', alt: '' }),
      ],
    })
    store.selection.select('img_blank')
    store.setInteractionProvider({
      pickAsset: vi.fn(() => ({ url: 'https://example.com/material.png', alt: 'Generated alt' })),
    })
    const mounted = mountWithStore(store, PropertiesPanel)

    button(mounted.host, PICK_TITLE).click()
    await flush()

    expect(store.schema.elements[0]?.props).toMatchObject({
      src: 'https://example.com/material.png',
      alt: 'Generated alt',
    })
    mounted.unmount()
  })

  it('does not overwrite an existing image material alt', async () => {
    const store = createStore({
      elements: [
        imageNode('img_existing', { src: '', alt: 'Keep me' }),
      ],
    })
    store.selection.select('img_existing')
    store.setInteractionProvider({
      pickAsset: vi.fn(() => ({ url: 'https://example.com/material.png', alt: 'Generated alt' })),
    })
    const mounted = mountWithStore(store, PropertiesPanel)

    button(mounted.host, PICK_TITLE).click()
    await flush()

    expect(store.schema.elements[0]?.props).toMatchObject({
      src: 'https://example.com/material.png',
      alt: 'Keep me',
    })
    mounted.unmount()
  })
})

function mountImageSourceEditor(options: {
  value?: string
  disabled?: boolean
  provider?: Parameters<DesignerStore['interactions']['setProvider']>[0]
} = {}) {
  const store = createStore()
  store.setInteractionProvider(options.provider)
  const model = ref(options.value ?? '')
  const events = {
    updates: [] as string[],
    commits: [] as string[],
    picks: [] as DesignerResolvedAsset[],
  }

  const mounted = mountWithStore(store, defineComponent({
    setup() {
      return () => h(ImageSourceEditor, {
        'label': 'Image',
        'modelValue': model.value,
        'disabled': options.disabled,
        'pickRequest': {
          id: 'designer.imageMaterial.pickImage',
          source: 'image-material',
          currentUrl: model.value,
          accept: ['image/*'],
        },
        't': store.t.bind(store),
        'onUpdate:modelValue': (value: string) => {
          model.value = value
          events.updates.push(value)
        },
        'onCommit': (value: string) => events.commits.push(value),
        'onPick': (result: DesignerResolvedAsset) => events.picks.push(result),
      })
    },
  }))

  return { ...mounted, events, store }
}

function mountWithStore(
  store: DesignerStore,
  component: Component,
  props: Record<string, unknown> = {},
) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const app = createApp(defineComponent({
    setup() {
      provideDesignerStore(store)
      return () => h(component, props)
    },
  }))
  app.mount(host)
  return {
    host,
    unmount() {
      app.unmount()
      host.remove()
    },
  }
}

function createStore(schema: ConstructorParameters<typeof Store>[0] = {}) {
  const store = new Store(schema)
  store.setLocale(enUS)
  return store
}

function imageNode(id: string, props: Record<string, unknown>) {
  return {
    id,
    type: 'image',
    x: 0,
    y: 0,
    width: 40,
    height: 30,
    rotation: 0,
    props,
  }
}

function textInput(host: HTMLElement): HTMLInputElement {
  const input = host.querySelector<HTMLInputElement>('input[type="text"]')
  if (!input)
    throw new Error('Expected text input.')
  return input
}

function button(host: HTMLElement, title: string): HTMLButtonElement {
  const found = host.querySelector<HTMLButtonElement>(`button[title="${title}"]`)
  if (!found)
    throw new Error(`Expected button "${title}".`)
  return found
}

async function flush() {
  await Promise.resolve()
  await nextTick()
  await new Promise(resolve => setTimeout(resolve, 0))
  await nextTick()
}
