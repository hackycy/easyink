import { defineComponent, h } from 'vue'

/**
 * EiSwitch -- Toggle switch
 */
export const EiSwitch = defineComponent({
  name: 'EiSwitch',
  props: {
    disabled: { default: false, type: Boolean },
    modelValue: { default: false, type: Boolean },
  },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    return () => {
      return h('label', { class: 'ei-switch' }, [
        h('input', {
          checked: props.modelValue,
          class: 'ei-switch__input',
          disabled: props.disabled,
          type: 'checkbox',
          onChange: (e: Event) => {
            emit('update:modelValue', (e.target as HTMLInputElement).checked)
          },
        }),
        h('span', { class: 'ei-switch__track' }),
        h('span', { class: 'ei-switch__thumb' }),
      ])
    }
  },
})
