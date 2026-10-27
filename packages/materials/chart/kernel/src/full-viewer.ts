import type { EChartsOption } from 'echarts'
import type { ChartMountHandle } from './types'
import * as echarts from 'echarts'

export { echarts }
export type { EChartsOption }

export function mountFullECharts(container: HTMLElement, option: EChartsOption): ChartMountHandle {
  prepareChartContainer(container)
  const chart = echarts.init(container, undefined, { renderer: 'svg' })
  chart.setOption(option, true)

  let frame = requestResize(chart)
  let observer: ResizeObserver | undefined
  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(() => {
      frame = requestResize(chart, frame)
    })
    observer.observe(container)
  }

  return {
    update(nextOption) {
      chart.setOption(nextOption as EChartsOption, true)
      frame = requestResize(chart, frame)
    },
    dispose() {
      if (frame !== undefined && typeof cancelAnimationFrame !== 'undefined')
        cancelAnimationFrame(frame)
      observer?.disconnect()
      chart.dispose()
    },
  }
}

export function renderFullEChartsSvg(option: EChartsOption, width: number, height: number): string {
  const chart = echarts.init(null, undefined, {
    renderer: 'svg',
    ssr: true,
    width: Math.max(1, Math.round(width)),
    height: Math.max(1, Math.round(height)),
  })
  chart.setOption(option, true)
  const svg = chart.renderToSVGString()
  chart.dispose()
  return svg
}

function prepareChartContainer(container: HTMLElement): void {
  container.style.width = '100%'
  container.style.height = '100%'
  container.style.minWidth = '1px'
  container.style.minHeight = '1px'
}

function requestResize(chart: ReturnType<typeof echarts.init>, currentFrame?: number): number | undefined {
  if (currentFrame !== undefined && typeof cancelAnimationFrame !== 'undefined')
    cancelAnimationFrame(currentFrame)
  if (typeof requestAnimationFrame === 'undefined') {
    chart.resize()
    return undefined
  }
  return requestAnimationFrame(() => chart.resize())
}
