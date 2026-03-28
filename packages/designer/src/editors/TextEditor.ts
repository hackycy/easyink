import { defineComponent, h } from 'vue'

export const TextEditor = defineComponent({
  name: 'TextEditor',
  props: {
    modelValue: { default: '', type: String },
    options: { default: () => ({}), type: Object },
  },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    return () => h('input', {
      class: 'easyink-editor easyink-editor-text',
      type: 'text',
      value: props.modelValue,
      onInput: (e: Event) => {
        emit('update:modelValue', (e.target as HTMLInputElement).value)
      },
    })
  },
})
