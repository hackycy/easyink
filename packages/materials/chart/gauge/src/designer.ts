import type { DesignerRendererContext, DesignerRenderInstance } from '@easyink/plugin-api/designer'

import type { ChartGaugeProps } from './schema'
import { createChartDesignerRenderHost, mountECharts } from '@easyink/material-chart-kernel'
import { getNodeProps } from '@easyink/schema'
import { createChartGaugePreviewOption } from './options'

export function createChartGaugeExtension(_context: DesignerRendererContext): DesignerRenderInstance {
  return {
    renderContent(nodeSignal, container) {
      container.replaceChildren()
      const { chartEl } = createChartDesignerRenderHost(container)

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
