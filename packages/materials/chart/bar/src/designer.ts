import type { DesignerRendererContext, DesignerRenderInstance } from '@easyink/plugin-api/designer'

import type { ChartBarProps } from './schema'
import { createChartDesignerRenderHost, mountECharts } from '@easyink/material-chart-kernel'
import { getNodeProps } from '@easyink/schema'
import { createChartBarPreviewOption } from './options'

export function createChartBarExtension(_context: DesignerRendererContext): DesignerRenderInstance {
  return {
    renderContent(nodeSignal, container) {
      container.replaceChildren()
      const { chartEl } = createChartDesignerRenderHost(container)

      const mount = mountECharts(chartEl, createChartBarPreviewOption(getNodeProps<ChartBarProps>(nodeSignal.get())))
      const unsubscribe = nodeSignal.subscribe((node) => {
        mount.update(createChartBarPreviewOption(getNodeProps<ChartBarProps>(node)))
      })

      return () => {
        unsubscribe()
        mount.dispose()
        container.replaceChildren()
      }
    },
  }
}
