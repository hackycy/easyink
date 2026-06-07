/**
 * @vitest-environment happy-dom
 */
import type { Component } from 'vue'
import type { PropSchema } from '../types'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick } from 'vue'
import enUS from '../../../locales/src/en-US'
import { provideDesignerStore } from '../composables'
import { DesignerStore } from '../store/designer-store'
import PropSchemaEditor from './PropSchemaEditor.vue'

afterEach(() => {
  document.body.innerHTML = ''
})

describe('prop schema editor text file import', () => {
  it('imports text files into code props through the interaction bridge', async () => {
    const store = createStore()
    const pickFileText = vi.fn(() => ({ text: '<svg viewBox="0 0 1 1"></svg>', name: 'logo.svg' }))
    store.setInteractionProvider({ pickFileText })
    const events = {
      previews: [] as Array<[string, unknown]>,
      changes: [] as Array<[string, unknown]>,
    }
    const schema: PropSchema = {
      key: 'content',
      label: 'designer.property.content',
      type: 'code',
      editorOptions: {
        language: 'html',
        fileImport: {
          kind: 'text',
          id: 'designer.svgCustom.importFile',
          source: 'svg-custom-content',
          accept: ['.svg', 'image/svg+xml'],
          maxBytes: 1024,
        },
      },
    }

    const mounted = mountWithStore(store, PropSchemaEditor, {
      schema,
      value: '',
      t: store.t.bind(store),
      onPreview: (key: string, value: unknown) => events.previews.push([key, value]),
      onChange: (key: string, value: unknown) => events.changes.push([key, value]),
    })

    button(mounted.host, 'Import File').click()
    await flush()

    expect(pickFileText).toHaveBeenCalledWith(expect.objectContaining({
      id: 'designer.svgCustom.importFile',
      source: 'svg-custom-content',
      accept: ['.svg', 'image/svg+xml'],
      maxBytes: 1024,
      payload: expect.objectContaining({
        propKey: 'content',
        propType: 'code',
      }),
    }))
    expect(events.previews).toEqual([['content', '<svg viewBox="0 0 1 1"></svg>']])
    expect(events.changes).toEqual([['content', '<svg viewBox="0 0 1 1"></svg>']])
    mounted.unmount()
  })

  it('disables the import action when no text file picker is available', () => {
    const store = createStore()
    const schema: PropSchema = {
      key: 'content',
      label: 'designer.property.content',
      type: 'code',
      editorOptions: {
        fileImport: {
          kind: 'text',
          accept: ['.svg', 'image/svg+xml'],
        },
      },
    }

    const mounted = mountWithStore(store, PropSchemaEditor, {
      schema,
      value: '',
      t: store.t.bind(store),
    })

    expect(button(mounted.host, 'Import File').disabled).toBe(true)
    mounted.unmount()
  })
})

function createStore() {
  const store = new DesignerStore()
  store.setLocale(enUS)
  return store
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
