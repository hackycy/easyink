import type { DesignerContext } from '../types'
import { toPixels } from '@easyink/core'
import { defineComponent, h, inject } from 'vue'
import { DESIGNER_INJECTION_KEY } from '../types'

export const AlignmentGuides = defineComponent({
  name: 'AlignmentGuides',
  setup() {
    const ctx = inject(DESIGNER_INJECTION_KEY) as DesignerContext

    return () => {
      const lines = ctx.snapping.activeSnapLines.value
      const unit = ctx.engine.schema.schema.page.unit
      const zoom = ctx.canvas.zoom.value

      return h('div', { class: 'easyink-alignment-guides' }, lines.map((line, i) => {
        const px = toPixels(line.position, unit, 96, zoom)
        const style = line.orientation === 'vertical'
          ? {
              height: '100%',
              left: `${px}px`,
              position: 'absolute' as const,
              top: '0',
              width: '1px',
            }
          : {
              height: '1px',
              left: '0',
              position: 'absolute' as const,
              top: `${px}px`,
              width: '100%',
            }
        return h('div', {
          class: `easyink-snap-line easyink-snap-line--${line.orientation}`,
          key: i,
          style,
        })
      }))
    }
  },
})
