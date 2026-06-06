import type { MaterialDesignerExtension, MaterialExtensionContext } from '@easyink/core'
import type { ChartGaugeProps } from './schema'
import { mountECharts } from '@easyink/material-chart-kernel'
import { getNodeProps } from '@easyink/schema'
import { createChartGaugePreviewOption } from './options'

export function createChartGaugeExtension(_context: MaterialExtensionContext): MaterialDesignerExtension {
  return {
    renderContent(nodeSignal, container) {
      container.replaceChildren()
      const chartEl = document.createElement('div')
      chartEl.style.width = '100%'
      chartEl.style.height = '100%'
      container.appendChild(chartEl)

      const mount = mountECharts(chartEl, createChartGaugePreviewOption(getNodeProps<ChartGaugeProps>(nodeSignal.get())))
      const unsubscribe = nodeSignal.subscribe((node) => {
        mount.update(createChartGaugePreviewOption(getNodeProps<ChartGaugeProps>(node)))
      })

      return () => {
        unsubscribe()
        mount.dispose()
        container.replaceChildren()
      }
    },
  }
}
