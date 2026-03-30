import type { BackgroundPosition } from '@easyink/shared'
import { defineComponent, h } from 'vue'

const POSITIONS: BackgroundPosition[] = [
  'top-left',
  'top',
  'top-right',
  'left',
  'center',
  'right',
  'bottom-left',
  'bottom',
  'bottom-right',
]

export const BackgroundPositionPicker = defineComponent({
  name: 'BackgroundPositionPicker',
  props: {
    modelValue: {
      default: 'center' as BackgroundPosition,
      type: String,
    },
  },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    return () => {
      return h('div', { class: 'easyink-position-picker' }, POSITIONS.map(pos =>
        h('button', {
          class: `easyink-position-picker__cell ${props.modelValue === pos ? 'easyink-position-picker__cell--active' : ''}`,
          onClick: () => emit('update:modelValue', pos),
          type: 'button',
        }),
      ))
    }
  },
})
