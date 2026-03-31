import type { FontDescriptor, FontManager } from '@easyink/core'
import { defineComponent, h, onMounted, ref, watch } from 'vue'

/**
 * EiFontSelector -- Font selector integrating FontManager registered fonts
 */
export const EiFontSelector = defineComponent({
  name: 'EiFontSelector',
  props: {
    disabled: { default: false, type: Boolean },
    fontManager: { default: undefined, type: Object as () => FontManager | undefined },
    modelValue: { default: '', type: String },
  },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    const fonts = ref<FontDescriptor[]>([])
    const loading = ref(false)

    async function loadFonts(): Promise<void> {
      if (!props.fontManager?.provider)
        return
      loading.value = true
      try {
        fonts.value = await props.fontManager.listFonts()
      }
      catch {
        fonts.value = []
      }
      finally {
        loading.value = false
      }
    }

    onMounted(loadFonts)
    watch(() => props.fontManager, loadFonts)

    return () => {
      const optionNodes = fonts.value.map(font =>
        h('option', {
          key: font.family,
          style: { fontFamily: font.family },
          value: font.family,
        }, font.displayName),
      )

      return h('div', { class: 'ei-font-selector' }, [
        h('select', {
          class: 'ei-editor ei-select',
          disabled: props.disabled || loading.value,
          value: props.modelValue,
          onChange: (e: Event) => {
            emit('update:modelValue', (e.target as HTMLSelectElement).value)
          },
        }, optionNodes),
      ])
    }
  },
})
