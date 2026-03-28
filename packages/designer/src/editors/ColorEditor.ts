import { defineComponent, h } from 'vue'

export const ColorEditor = defineComponent({
  name: 'ColorEditor',
  props: {
    modelValue: { default: '#000000', type: String },
    options: { default: () => ({}), type: Object },
  },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    return () => h('input', {
      class: 'easyink-editor easyink-editor-color',
      type: 'color',
      value: props.modelValue,
      onInput: (e: Event) => {
        emit('update:modelValue', (e.target as HTMLInputElement).value)
      },
    })
  },
})
