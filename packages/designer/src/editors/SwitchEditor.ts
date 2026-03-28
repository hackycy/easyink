import { defineComponent, h } from 'vue'

export const SwitchEditor = defineComponent({
  name: 'SwitchEditor',
  props: {
    modelValue: { default: false, type: Boolean },
    options: { default: () => ({}), type: Object },
  },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    return () => h('input', {
      checked: props.modelValue,
      class: 'easyink-editor easyink-editor-switch',
      type: 'checkbox',
      onChange: (e: Event) => {
        emit('update:modelValue', (e.target as HTMLInputElement).checked)
      },
    })
  },
})
