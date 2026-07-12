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
  it('limits string input by schema min and max character counts', async () => {
    const store = createStore()
    const events = {
      previews: [] as Array<[string, unknown]>,
      changes: [] as Array<[string, unknown]>,
    }
    const schema: PropSchema = {
      key: 'character',
      label: 'designer.property.content',
      type: 'string',
      min: 1,
      max: 1,
    }

    const mounted = mountWithStore(store, PropSchemaEditor, {
      schema,
      value: '',
      t: store.t.bind(store),
      onPreview: (key: string, value: unknown) => events.previews.push([key, value]),
      onChange: (key: string, value: unknown) => events.changes.push([key, value]),
    })

    const input = mounted.host.querySelector('input')
    if (!input)
      throw new Error('Expected string input.')

    input.focus()
    input.value = 'ABCD'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('blur', { bubbles: true }))
    await flush()

    input.focus()
    input.value = '满意'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('blur', { bubbles: true }))
    await flush()

    expect(input.minLength).toBe(1)
    expect(input.hasAttribute('maxlength')).toBe(false)
    expect(events.previews).toEqual([['character', 'A'], ['character', '满']])
    expect(events.changes).toEqual([['character', 'A'], ['character', '满']])
    mounted.unmount()
  })

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
        valueInput: {
          kind: 'text-file',
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
        valueInput: {
          kind: 'text-file',
          id: 'designer.svgCustom.importFile',
          source: 'svg-custom-content',
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
