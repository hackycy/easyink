import type { PropSchema } from '@easyink/core'
import { describe, expect, it } from 'vitest'
import { createApp, h } from 'vue'
import { EiArrayEditor } from '../components/EiArrayEditor'

function mount(component: any, props: Record<string, any> = {}) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const app = createApp({ render: () => h(component, props) })
  app.mount(container)
  return {
    app,
    container,
    unmount: () => {
      app.unmount()
      container.remove()
    },
  }
}

describe('eiArrayEditor', () => {
  const stringSchema: PropSchema = {
    key: 'item',
    label: 'Item',
    type: 'string',
  }

  it('renders items', () => {
    const { container, unmount } = mount(EiArrayEditor, {
      itemSchema: stringSchema,
      modelValue: ['a', 'b', 'c'],
    })
    const items = container.querySelectorAll('.ei-array-editor__item')
    expect(items.length).toBe(3)
    unmount()
  })

  it('renders add button', () => {
    const { container, unmount } = mount(EiArrayEditor, {
      itemSchema: stringSchema,
      modelValue: [],
    })
    const addBtn = container.querySelector('.ei-array-editor__add')
    expect(addBtn).toBeTruthy()
    expect(addBtn?.textContent).toContain('Add')
    unmount()
  })

  it('renders action buttons for each item', () => {
    const { container, unmount } = mount(EiArrayEditor, {
      itemSchema: stringSchema,
      modelValue: ['a'],
    })
    const actions = container.querySelectorAll('.ei-array-editor__btn')
    // 3 buttons: up, down, delete
    expect(actions.length).toBe(3)
    unmount()
  })

  it('disables up button for first item', () => {
    const { container, unmount } = mount(EiArrayEditor, {
      itemSchema: stringSchema,
      modelValue: ['a', 'b'],
    })
    const firstItem = container.querySelectorAll('.ei-array-editor__item')[0]
    const upButton = firstItem.querySelectorAll('.ei-array-editor__btn')[0]
    expect((upButton as HTMLButtonElement).disabled).toBe(true)
    unmount()
  })

  it('disables down button for last item', () => {
    const { container, unmount } = mount(EiArrayEditor, {
      itemSchema: stringSchema,
      modelValue: ['a', 'b'],
    })
    const lastItem = container.querySelectorAll('.ei-array-editor__item')[1]
    const downButton = lastItem.querySelectorAll('.ei-array-editor__btn')[1]
    expect((downButton as HTMLButtonElement).disabled).toBe(true)
    unmount()
  })

  it('renders empty state with only add button', () => {
    const { container, unmount } = mount(EiArrayEditor, {
      itemSchema: stringSchema,
      modelValue: [],
    })
    const items = container.querySelectorAll('.ei-array-editor__item')
    expect(items.length).toBe(0)
    const addBtn = container.querySelector('.ei-array-editor__add')
    expect(addBtn).toBeTruthy()
    unmount()
  })

  it('renders with object item schema', () => {
    const objectSchema: PropSchema = {
      key: 'column',
      label: 'Column',
      properties: [
        { key: 'title', label: 'Title', type: 'string' },
        { key: 'width', label: 'Width', type: 'number' },
      ],
      type: 'object',
    }
    const items = [
      { title: 'Name', width: 100 },
      { title: 'Age', width: 50 },
    ]
    const { container, unmount } = mount(EiArrayEditor, {
      itemSchema: objectSchema,
      modelValue: items,
    })
    const editorItems = container.querySelectorAll('.ei-array-editor__item')
    expect(editorItems.length).toBe(2)
    unmount()
  })
})
