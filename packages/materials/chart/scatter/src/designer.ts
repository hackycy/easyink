import type { MaterialDesignerExtension, MaterialExtensionContext } from '@easyink/core'
import type { ChartScatterProps } from './schema'
import { createChartDesignerRenderHost, mountECharts } from '@easyink/material-chart-kernel'
import { getNodeModel } from '@easyink/schema'
import { createChartScatterPreviewOption } from './options'

export function createChartScatterExtension(_context: MaterialExtensionContext): MaterialDesignerExtension {
  return {
    renderContent(nodeSignal, container) {
      container.replaceChildren()
      const { chartEl } = createChartDesignerRenderHost(container)

      const mount = mountECharts(chartEl, createChartScatterPreviewOption(getNodeModel<ChartScatterProps>(nodeSignal.get())))
      const unsubscribe = nodeSignal.subscribe((node) => {
        mount.update(createChartScatterPreviewOption(getNodeModel<ChartScatterProps>(node)))
      })

      return () => {
        unsubscribe()
        mount.dispose()
        container.replaceChildren()
      }
    },
  }
}
