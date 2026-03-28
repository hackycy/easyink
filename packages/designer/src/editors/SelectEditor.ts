import { defineComponent, h } from 'vue'

export const SelectEditor = defineComponent({
  name: 'SelectEditor',
  props: {
    modelValue: { default: '', type: [String, Number] },
    options: { default: () => ({}), type: Object },
  },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    return () => {
      const opts = props.options as Record<string, unknown>
      const items = (opts.options ?? []) as string[]
      return h('select', {
        class: 'easyink-editor easyink-editor-select',
        value: props.modelValue,
        onChange: (e: Event) => {
          emit('update:modelValue', (e.target as HTMLSelectElement).value)
        },
      }, items.map(item =>
        h('option', { key: item, value: item }, item),
      ))
    }
  },
})
