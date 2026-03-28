import { defineComponent, h, inject } from 'vue'
import { DESIGNER_INJECTION_KEY } from '../types'

export const StatusBar = defineComponent({
  name: 'StatusBar',
  setup() {
    const ctx = inject(DESIGNER_INJECTION_KEY)!

    return () => {
      const t = ctx.locale.t
      const unit = ctx.engine.schema.schema.page.unit

      return h('div', { class: 'easyink-statusbar' }, [
        h('div', { class: 'easyink-statusbar__left' }, [
          h('span', {}, `${t('statusBar.unit')}: ${unit}`),
        ]),
        h('div', { class: 'easyink-statusbar__right' }, [
          h('button', {
            class: 'easyink-statusbar__zoom-btn',
            onClick: () => ctx.canvas.zoomOut(),
          }, '\u2212'),
          h('input', {
            class: 'easyink-statusbar__zoom-slider',
            max: 400,
            min: 25,
            type: 'range',
            value: ctx.canvas.zoomPercent.value,
            onInput: (e: Event) => {
              const v = Number.parseInt((e.target as HTMLInputElement).value, 10)
              ctx.canvas.setZoom(v / 100)
            },
          }),
          h('button', {
            class: 'easyink-statusbar__zoom-btn',
            onClick: () => ctx.canvas.zoomIn(),
          }, '+'),
          h('span', {}, `${ctx.canvas.zoomPercent.value}%`),
        ]),
      ])
    }
  },
})
