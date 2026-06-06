import type { EChartsCoreOption } from 'echarts/core'
import type { ChartMountHandle } from './types'
import { BarChart, LineChart, PieChart, ScatterChart } from 'echarts/charts'
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components'
import { init, use } from 'echarts/core'
import { SVGRenderer } from 'echarts/renderers'

let echartsRegistered = false

export function ensureEChartsRegistered(): void {
  if (echartsRegistered)
    return
  use([BarChart, LineChart, PieChart, ScatterChart, GridComponent, LegendComponent, TooltipComponent, SVGRenderer])
  echartsRegistered = true
}

export function mountECharts(container: HTMLElement, option: EChartsCoreOption): ChartMountHandle {
  ensureEChartsRegistered()
  prepareChartContainer(container)
  const chart = init(container, undefined, { renderer: 'svg' })
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
      chart.setOption(nextOption, true)
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

export function renderEChartsSvg(option: EChartsCoreOption, width: number, height: number): string {
  ensureEChartsRegistered()
  const chart = init(null, undefined, {
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

function requestResize(chart: ReturnType<typeof init>, currentFrame?: number): number | undefined {
  if (currentFrame !== undefined && typeof cancelAnimationFrame !== 'undefined')
    cancelAnimationFrame(currentFrame)
  if (typeof requestAnimationFrame === 'undefined') {
    chart.resize()
    return undefined
  }
  return requestAnimationFrame(() => chart.resize())
}
