import type { ChartDesignerRenderHost } from './types'

export function createChartDesignerRenderHost(container: HTMLElement): ChartDesignerRenderHost {
  const hostEl = document.createElement('div')
  hostEl.style.position = 'relative'
  hostEl.style.width = '100%'
  hostEl.style.height = '100%'
  hostEl.style.minWidth = '1px'
  hostEl.style.minHeight = '1px'

  const chartEl = document.createElement('div')
  chartEl.style.position = 'absolute'
  chartEl.style.inset = '0'
  chartEl.style.width = '100%'
  chartEl.style.height = '100%'

  const maskEl = document.createElement('div')
  maskEl.style.position = 'absolute'
  maskEl.style.inset = '0'
  maskEl.style.zIndex = '1'
  maskEl.style.background = 'transparent'
  maskEl.style.cursor = 'inherit'

  hostEl.append(chartEl, maskEl)
  container.appendChild(hostEl)

  return { chartEl, maskEl }
}
