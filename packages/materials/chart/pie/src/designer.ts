import type { MaterialDesignerExtension, MaterialExtensionContext } from '@easyink/core'
import type { ChartPieProps } from './schema'
import { mountECharts } from '@easyink/material-chart-kernel'
import { getNodeProps } from '@easyink/schema'
import { createChartPiePreviewOption } from './options'

export function createChartPieExtension(_context: MaterialExtensionContext): MaterialDesignerExtension {
  return {
    renderContent(nodeSignal, container) {
      container.replaceChildren()
      const chartEl = document.createElement('div')
      chartEl.style.width = '100%'
      chartEl.style.height = '100%'
      container.appendChild(chartEl)

      const mount = mountECharts(chartEl, createChartPiePreviewOption(getNodeProps<ChartPieProps>(nodeSignal.get())))
      const unsubscribe = nodeSignal.subscribe((node) => {
        mount.update(createChartPiePreviewOption(getNodeProps<ChartPieProps>(node)))
      })

      return () => {
        unsubscribe()
        mount.dispose()
        container.replaceChildren()
      }
    },
  }
}
