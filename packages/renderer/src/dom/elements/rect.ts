import type { ElementRenderFunction } from '../../types'

/**
 * 矩形元素渲染器
 *
 * props: borderRadius, fill
 */
export const renderRect: ElementRenderFunction = (node, _context) => {
  const el = document.createElement('div')
  el.className = 'easyink-element easyink-rect'
  el.dataset.elementId = node.id

  const props = node.props as unknown as { borderRadius?: number | number[], fill?: string }

  if (props.fill)
    el.style.backgroundColor = props.fill

  if (props.borderRadius != null) {
    if (typeof props.borderRadius === 'number') {
      el.style.borderRadius = `${props.borderRadius}px`
    }
    else if (Array.isArray(props.borderRadius)) {
      el.style.borderRadius = props.borderRadius.map(r => `${r}px`).join(' ')
    }
  }

  return el
}
