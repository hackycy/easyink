import type { PropSchema } from '@easyink/core'
import type { VNode } from 'vue'
import { defineComponent, h, ref, watch } from 'vue'

/**
 * EiArrayEditor -- Generic list editor with add/delete/reorder
 *
 * Each item is rendered according to the provided `itemSchema`.
 * When `itemSchema.type === 'object'`, each item renders a nested form via `formRenderer`.
 * Otherwise, a single editor is rendered per item.
 */
export const EiArrayEditor = defineComponent({
  name: 'EiArrayEditor',
  props: {
    disabled: { default: false, type: Boolean },
    formRenderer: { default: undefined, type: Function as unknown as () => ((schemas: PropSchema[], values: Record<string, unknown>, onChange: (key: string, value: unknown) => void) => VNode) | undefined },
    itemSchema: { required: true, type: Object as () => PropSchema },
    modelValue: { default: () => [], type: Array as () => unknown[] },
    singleEditorRenderer: { default: undefined, type: Function as unknown as () => ((schema: PropSchema, value: unknown, onChange: (value: unknown) => void) => VNode) | undefined },
  },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    const localItems = ref<unknown[]>([...props.modelValue])

    watch(() => props.modelValue, (v) => {
      localItems.value = [...v]
    })

    function emitUpdate(): void {
      emit('update:modelValue', [...localItems.value])
    }

    function addItem(): void {
      const defaultValue = props.itemSchema.type === 'object'
        ? buildDefaultObject(props.itemSchema.properties ?? [])
        : (props.itemSchema.defaultValue ?? getTypeDefault(props.itemSchema.type))
      localItems.value.push(defaultValue)
      emitUpdate()
    }

    function removeItem(index: number): void {
      localItems.value.splice(index, 1)
      emitUpdate()
    }

    function moveUp(index: number): void {
      if (index <= 0)
        return
      const items = localItems.value
      const temp = items[index]
      items[index] = items[index - 1]
      items[index - 1] = temp
      emitUpdate()
    }

    function moveDown(index: number): void {
      if (index >= localItems.value.length - 1)
        return
      const items = localItems.value
      const temp = items[index]
      items[index] = items[index + 1]
      items[index + 1] = temp
      emitUpdate()
    }

    function updateItem(index: number, value: unknown): void {
      localItems.value[index] = value
      emitUpdate()
    }

    function renderItem(item: unknown, index: number): VNode {
      const schema = props.itemSchema

      let contentNode: VNode
      if (schema.type === 'object' && schema.properties && props.formRenderer) {
        const values = (item ?? {}) as Record<string, unknown>
        contentNode = props.formRenderer(
          schema.properties,
          values,
          (key: string, value: unknown) => {
            const updated = { ...values, [key]: value }
            updateItem(index, updated)
          },
        )
      }
      else if (props.singleEditorRenderer) {
        contentNode = props.singleEditorRenderer(
          schema,
          item,
          (value: unknown) => updateItem(index, value),
        )
      }
      else {
        contentNode = h('span', {}, String(item))
      }

      return h('div', { class: 'ei-array-editor__item', key: index }, [
        h('div', { class: 'ei-array-editor__item-content' }, [contentNode]),
        h('div', { class: 'ei-array-editor__item-actions' }, [
          h('button', {
            class: 'ei-array-editor__btn',
            disabled: props.disabled || index === 0,
            title: 'Move up',
            type: 'button',
            onClick: () => moveUp(index),
          }, h('svg', { width: 10, height: 10, viewBox: '0 0 10 10' }, [
            h('path', { 'd': 'M2 7L5 3L8 7', 'fill': 'none', 'stroke': 'currentColor', 'stroke-width': 1.5 }),
          ])),
          h('button', {
            class: 'ei-array-editor__btn',
            disabled: props.disabled || index === localItems.value.length - 1,
            title: 'Move down',
            type: 'button',
            onClick: () => moveDown(index),
          }, h('svg', { width: 10, height: 10, viewBox: '0 0 10 10' }, [
            h('path', { 'd': 'M2 3L5 7L8 3', 'fill': 'none', 'stroke': 'currentColor', 'stroke-width': 1.5 }),
          ])),
          h('button', {
            class: 'ei-array-editor__btn ei-array-editor__btn--danger',
            disabled: props.disabled,
            title: 'Remove',
            type: 'button',
            onClick: () => removeItem(index),
          }, h('svg', { width: 10, height: 10, viewBox: '0 0 10 10' }, [
            h('path', { 'd': 'M2 2L8 8M8 2L2 8', 'fill': 'none', 'stroke': 'currentColor', 'stroke-width': 1.5 }),
          ])),
        ]),
      ])
    }

    return () => {
      return h('div', { class: 'ei-array-editor' }, [
        ...localItems.value.map((item, index) => renderItem(item, index)),
        h('button', {
          class: 'ei-array-editor__add',
          disabled: props.disabled,
          type: 'button',
          onClick: addItem,
        }, '+ Add'),
      ])
    }
  },
})

function buildDefaultObject(schemas: PropSchema[]): Record<string, unknown> {
  const obj: Record<string, unknown> = {}
  for (const s of schemas) {
    obj[s.key] = s.defaultValue ?? getTypeDefault(s.type)
  }
  return obj
}

function getTypeDefault(type: string): unknown {
  switch (type) {
    case 'string':
    case 'color':
    case 'font':
      return ''
    case 'number':
      return 0
    case 'boolean':
      return false
    case 'object':
      return {}
    case 'array':
      return []
    default:
      return ''
  }
}
