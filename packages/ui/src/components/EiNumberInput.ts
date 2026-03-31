import { defineComponent, h } from 'vue'

/**
 * EiNumberInput -- Number input with min/max/step and up/down controls
 */
export const EiNumberInput = defineComponent({
  name: 'EiNumberInput',
  props: {
    disabled: { default: false, type: Boolean },
    max: { default: undefined, type: Number },
    min: { default: undefined, type: Number },
    modelValue: { default: 0, type: Number },
    step: { default: 1, type: Number },
  },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    function clamp(value: number): number {
      let v = value
      if (props.min !== undefined && v < props.min)
        v = props.min
      if (props.max !== undefined && v > props.max)
        v = props.max
      return v
    }

    function update(value: number): void {
      const clamped = clamp(value)
      emit('update:modelValue', clamped)
    }

    function increment(): void {
      update((props.modelValue ?? 0) + props.step)
    }

    function decrement(): void {
      update((props.modelValue ?? 0) - props.step)
    }

    return () => {
      const atMax = props.max !== undefined && (props.modelValue ?? 0) >= props.max
      const atMin = props.min !== undefined && (props.modelValue ?? 0) <= props.min

      return h('div', {
        class: [
          'ei-number-input',
          props.disabled ? 'ei-number-input--disabled' : '',
        ].filter(Boolean).join(' '),
      }, [
        h('input', {
          class: 'ei-editor ei-number-input__inner',
          disabled: props.disabled,
          max: props.max,
          min: props.min,
          step: props.step,
          type: 'number',
          value: props.modelValue,
          onInput: (e: Event) => {
            const raw = (e.target as HTMLInputElement).value
            const num = Number.parseFloat(raw)
            if (!Number.isNaN(num)) {
              update(num)
            }
          },
          onBlur: (e: Event) => {
            const raw = (e.target as HTMLInputElement).value
            const num = Number.parseFloat(raw)
            update(Number.isNaN(num) ? 0 : num)
          },
        }),
        h('div', { class: 'ei-number-input__controls' }, [
          h('button', {
            class: 'ei-number-input__btn',
            disabled: props.disabled || atMax,
            tabindex: -1,
            type: 'button',
            onClick: increment,
          }, h('svg', { width: 10, height: 10, viewBox: '0 0 10 10' }, [
            h('path', { 'd': 'M2 7L5 3L8 7', 'fill': 'none', 'stroke': 'currentColor', 'stroke-width': 1.5 }),
          ])),
          h('button', {
            class: 'ei-number-input__btn',
            disabled: props.disabled || atMin,
            tabindex: -1,
            type: 'button',
            onClick: decrement,
          }, h('svg', { width: 10, height: 10, viewBox: '0 0 10 10' }, [
            h('path', { 'd': 'M2 3L5 7L8 3', 'fill': 'none', 'stroke': 'currentColor', 'stroke-width': 1.5 }),
          ])),
        ]),
      ])
    }
  },
})
