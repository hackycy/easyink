import { defineComponent, h } from 'vue'

export interface CreateIconOptions {
  name: string
  svg: string
  viewBox?: string
}

/**
 * Create a Vue icon component from raw SVG inner content.
 * The component accepts `size` (number | string, default 24) and passes
 * through any extra attrs (class, style, etc.) to the root `<svg>`.
 */
export function createIcon(options: CreateIconOptions) {
  const { name, svg, viewBox = '0 0 24 24' } = options
  return defineComponent({
    name,
    props: {
      size: {
        type: [Number, String],
        default: 24,
      },
    },
    setup(props, { attrs }) {
      return () =>
        h('svg', {
          'xmlns': 'http://www.w3.org/2000/svg',
          'width': props.size,
          'height': props.size,
          'viewBox': viewBox,
          'fill': 'none',
          'stroke': 'currentColor',
          'stroke-width': 2,
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          'innerHTML': svg,
          ...attrs,
        })
    },
  })
}
