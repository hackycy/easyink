import type { MaterialDesignerExtension, MaterialExtensionContext } from '@easyink/core'
import type { ChartBarProps } from './schema'
import { createChartDesignerRenderHost, mountECharts } from '@easyink/material-chart-kernel'
import { getNodeModel } from '@easyink/schema'
import { createChartBarPreviewOption } from './options'

export function createChartBarExtension(_context: MaterialExtensionContext): MaterialDesignerExtension {
  return {
    renderContent(nodeSignal, container) {
      container.replaceChildren()
      const { chartEl } = createChartDesignerRenderHost(container)

      const mount = mountECharts(chartEl, createChartBarPreviewOption(getNodeModel<ChartBarProps>(nodeSignal.get())))
      const unsubscribe = nodeSignal.subscribe((node) => {
        mount.update(createChartBarPreviewOption(getNodeModel<ChartBarProps>(node)))
      })

      return () => {
        unsubscribe()
        mount.dispose()
        container.replaceChildren()
      }
    },
  }
}
