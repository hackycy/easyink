import type { DesignerRendererContext, DesignerRenderInstance } from '@easyink/plugin-api/designer'

import type { ChartPieProps } from './schema'
import { createChartDesignerRenderHost, mountECharts } from '@easyink/material-chart-kernel'
import { getNodeProps } from '@easyink/schema'
import { createChartPiePreviewOption } from './options'

export function createChartPieExtension(_context: DesignerRendererContext): DesignerRenderInstance {
  return {
    renderContent(nodeSignal, container) {
      container.replaceChildren()
      const { chartEl } = createChartDesignerRenderHost(container)

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
