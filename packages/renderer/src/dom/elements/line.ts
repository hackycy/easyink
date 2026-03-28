import type { ElementRenderFunction } from '../../types'

interface LineProps {
  direction: 'horizontal' | 'vertical' | 'custom'
  strokeWidth: number
  strokeColor: string
  strokeStyle: 'solid' | 'dashed' | 'dotted'
  endX?: number
  endY?: number
}

/**
 * 线条元素渲染器
 *
 * horizontal/vertical → div with border
 * custom → SVG line
 */
export const renderLine: ElementRenderFunction = (node, context) => {
  const props = node.props as unknown as LineProps

  if (props.direction === 'custom') {
    return renderCustomLine(node.id, props, context.toPixels)
  }

  const el = document.createElement('div')
  el.className = 'easyink-element easyink-line'
  el.dataset.elementId = node.id

  const widthPx = `${context.toPixels(props.strokeWidth)}px`

  if (props.direction === 'horizontal') {
    el.style.borderTop = `${widthPx} ${props.strokeStyle} ${props.strokeColor}`
    el.style.height = '0'
  }
  else {
    el.style.borderLeft = `${widthPx} ${props.strokeStyle} ${props.strokeColor}`
    el.style.width = '0'
  }

  return el
}

function renderCustomLine(
  id: string,
  props: LineProps,
  toPixels: (v: number) => number,
): HTMLElement {
  const wrapper = document.createElement('div')
  wrapper.className = 'easyink-element easyink-line easyink-line--custom'
  wrapper.dataset.elementId = id

  const endX = toPixels(props.endX ?? 0)
  const endY = toPixels(props.endY ?? 0)
  const strokePx = toPixels(props.strokeWidth)

  const svgNs = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(svgNs, 'svg')
  svg.setAttribute('width', '100%')
  svg.setAttribute('height', '100%')
  svg.style.position = 'absolute'
  svg.style.left = '0'
  svg.style.top = '0'
  svg.style.overflow = 'visible'

  const line = document.createElementNS(svgNs, 'line')
  line.setAttribute('x1', '0')
  line.setAttribute('y1', '0')
  line.setAttribute('x2', String(endX))
  line.setAttribute('y2', String(endY))
  line.setAttribute('stroke', props.strokeColor)
  line.setAttribute('stroke-width', String(strokePx))

  if (props.strokeStyle === 'dashed') {
    line.setAttribute('stroke-dasharray', `${strokePx * 4} ${strokePx * 2}`)
  }
  else if (props.strokeStyle === 'dotted') {
    line.setAttribute('stroke-dasharray', `${strokePx} ${strokePx}`)
  }

  svg.appendChild(line)
  wrapper.appendChild(svg)
  return wrapper
}
