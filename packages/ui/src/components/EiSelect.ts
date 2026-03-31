import { defineComponent, h } from 'vue'

/**
 * EiSelect -- Dropdown select with label+value enum support
 */
export const EiSelect = defineComponent({
  name: 'EiSelect',
  props: {
    disabled: { default: false, type: Boolean },
    modelValue: { default: '', type: [String, Number, Boolean] },
    options: { default: () => [], type: Array as () => Array<{ label: string, value: string | number | boolean }> },
    placeholder: { default: '', type: String },
  },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    return () => {
      const items = props.options

      const optionNodes = items.map(item =>
        h('option', {
          key: String(item.value),
          value: String(item.value),
        }, item.label),
      )

      if (props.placeholder) {
        optionNodes.unshift(
          h('option', { disabled: true, value: '' }, props.placeholder),
        )
      }

      return h('select', {
        class: 'ei-editor ei-select',
        disabled: props.disabled,
        value: String(props.modelValue),
        onChange: (e: Event) => {
          const raw = (e.target as HTMLSelectElement).value
          // Try to match back to original type
          const matched = items.find(item => String(item.value) === raw)
          emit('update:modelValue', matched ? matched.value : raw)
        },
      }, optionNodes)
    }
  },
})
