import type { MaterialDesignerExtension, MaterialExtensionContext } from '@easyink/core'
import type { ChartGaugeProps } from './schema'
import { createChartDesignerRenderHost, mountECharts } from '@easyink/material-chart-kernel'
import { getNodeModel } from '@easyink/schema'
import { createChartGaugePreviewOption } from './options'

export function createChartGaugeExtension(_context: MaterialExtensionContext): MaterialDesignerExtension {
  return {
    renderContent(nodeSignal, container) {
      container.replaceChildren()
      const { chartEl } = createChartDesignerRenderHost(container)

      const mount = mountECharts(chartEl, createChartGaugePreviewOption(getNodeModel<ChartGaugeProps>(nodeSignal.get())))
      const unsubscribe = nodeSignal.subscribe((node) => {
        mount.update(createChartGaugePreviewOption(getNodeModel<ChartGaugeProps>(node)))
      })

      return () => {
        unsubscribe()
        mount.dispose()
        container.replaceChildren()
      }
    },
  }
}
