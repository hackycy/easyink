import type { DesignerRendererContext, DesignerRenderInstance } from '@easyink/plugin-api/designer'

import type { ChartScatterProps } from './schema'
import { createChartDesignerRenderHost, mountECharts } from '@easyink/material-chart-kernel'
import { getNodeProps } from '@easyink/schema'
import { createChartScatterPreviewOption } from './options'

export function createChartScatterExtension(_context: DesignerRendererContext): DesignerRenderInstance {
  return {
    renderContent(nodeSignal, container) {
      container.replaceChildren()
      const { chartEl } = createChartDesignerRenderHost(container)

      const mount = mountECharts(chartEl, createChartScatterPreviewOption(getNodeProps<ChartScatterProps>(nodeSignal.get())))
      const unsubscribe = nodeSignal.subscribe((node) => {
        mount.update(createChartScatterPreviewOption(getNodeProps<ChartScatterProps>(node)))
      })

      return () => {
        unsubscribe()
        mount.dispose()
        container.replaceChildren()
      }
    },
  }
}
