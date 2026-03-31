import { computed, defineComponent, h } from 'vue'

/**
 * EiSlider -- Slider control with value display
 */
export const EiSlider = defineComponent({
  name: 'EiSlider',
  props: {
    disabled: { default: false, type: Boolean },
    max: { default: 100, type: Number },
    min: { default: 0, type: Number },
    modelValue: { default: 0, type: Number },
    step: { default: 1, type: Number },
  },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    const displayValue = computed(() => {
      if (props.step < 1) {
        const decimals = String(props.step).split('.')[1]?.length ?? 1
        return props.modelValue.toFixed(decimals)
      }
      return String(props.modelValue)
    })

    return () => {
      return h('div', { class: 'ei-slider' }, [
        h('input', {
          class: 'ei-slider__track',
          disabled: props.disabled,
          max: props.max,
          min: props.min,
          step: props.step,
          type: 'range',
          value: props.modelValue,
          onInput: (e: Event) => {
            const num = Number.parseFloat((e.target as HTMLInputElement).value)
            emit('update:modelValue', Number.isNaN(num) ? props.min : num)
          },
        }),
        h('span', { class: 'ei-slider__value' }, displayValue.value),
      ])
    }
  },
})
