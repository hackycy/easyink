import { defineComponent, h } from 'vue'

export const NumberEditor = defineComponent({
  name: 'NumberEditor',
  props: {
    modelValue: { default: 0, type: [Number, String] },
    options: { default: () => ({}), type: Object },
  },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    return () => {
      const opts = props.options as Record<string, unknown>
      return h('input', {
        class: 'easyink-editor easyink-editor-number',
        max: opts.max as number | undefined,
        min: opts.min as number | undefined,
        step: opts.step as number | undefined,
        type: 'number',
        value: props.modelValue,
        onInput: (e: Event) => {
          const v = (e.target as HTMLInputElement).value
          const num = Number.parseFloat(v)
          emit('update:modelValue', Number.isNaN(num) ? 0 : num)
        },
      })
    }
  },
})
