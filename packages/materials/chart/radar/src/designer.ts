import type { MaterialDesignerExtension, MaterialExtensionContext } from '@easyink/core'
import type { ChartRadarProps } from './schema'
import { mountECharts } from '@easyink/material-chart-kernel'
import { getNodeProps } from '@easyink/schema'
import { createChartRadarPreviewOption } from './options'

export function createChartRadarExtension(_context: MaterialExtensionContext): MaterialDesignerExtension {
  return {
    renderContent(nodeSignal, container) {
      container.replaceChildren()
      const chartEl = document.createElement('div')
      chartEl.style.width = '100%'
      chartEl.style.height = '100%'
      container.appendChild(chartEl)

      const mount = mountECharts(chartEl, createChartRadarPreviewOption(getNodeProps<ChartRadarProps>(nodeSignal.get())))
      const unsubscribe = nodeSignal.subscribe((node) => {
        mount.update(createChartRadarPreviewOption(getNodeProps<ChartRadarProps>(node)))
      })

      return () => {
        unsubscribe()
        mount.dispose()
        container.replaceChildren()
      }
    },
  }
}
