import { defineComponent, h } from 'vue'

/**
 * EiInput -- Text input with maxLength and pattern validation
 */
export const EiInput = defineComponent({
  name: 'EiInput',
  props: {
    disabled: { default: false, type: Boolean },
    maxLength: { default: undefined, type: Number },
    modelValue: { default: '', type: String },
    pattern: { default: undefined, type: String },
    placeholder: { default: '', type: String },
  },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    function validate(value: string): boolean {
      if (props.pattern) {
        try {
          return new RegExp(props.pattern).test(value)
        }
        catch {
          return true
        }
      }
      return true
    }

    return () => {
      const isValid = validate(props.modelValue)
      const classes = ['ei-editor', 'ei-input']
      if (!isValid) {
        classes.push('ei-input--error')
      }

      return h('input', {
        class: classes.join(' '),
        disabled: props.disabled,
        maxlength: props.maxLength,
        placeholder: props.placeholder,
        type: 'text',
        value: props.modelValue,
        onInput: (e: Event) => {
          emit('update:modelValue', (e.target as HTMLInputElement).value)
        },
      })
    }
  },
})
