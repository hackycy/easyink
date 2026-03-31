import { defineComponent, h, ref, watch } from 'vue'

/**
 * EiColorPicker -- Color picker with swatch and hex text input
 */
export const EiColorPicker = defineComponent({
  name: 'EiColorPicker',
  props: {
    disabled: { default: false, type: Boolean },
    modelValue: { default: '#000000', type: String },
  },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    const textValue = ref(props.modelValue)

    watch(() => props.modelValue, (v) => {
      textValue.value = v
    })

    function isValidColor(value: string): boolean {
      return /^#[\dA-F]{3,8}$/i.test(value)
    }

    function onTextInput(e: Event): void {
      const value = (e.target as HTMLInputElement).value
      textValue.value = value
      if (isValidColor(value)) {
        emit('update:modelValue', value)
      }
    }

    function onTextBlur(): void {
      if (!isValidColor(textValue.value)) {
        textValue.value = props.modelValue
      }
    }

    return () => {
      return h('div', { class: 'ei-color-picker' }, [
        h('input', {
          class: 'ei-color-picker__swatch',
          disabled: props.disabled,
          type: 'color',
          value: props.modelValue,
          onInput: (e: Event) => {
            const value = (e.target as HTMLInputElement).value
            textValue.value = value
            emit('update:modelValue', value)
          },
        }),
        h('input', {
          class: 'ei-editor ei-color-picker__text',
          disabled: props.disabled,
          maxlength: 9,
          type: 'text',
          value: textValue.value,
          onBlur: onTextBlur,
          onInput: onTextInput,
        }),
      ])
    }
  },
})
