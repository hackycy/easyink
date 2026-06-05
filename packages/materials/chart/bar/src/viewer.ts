import type { ViewerRenderContext } from '@easyink/core'
import type { MaterialNode } from '@easyink/schema'
import type { ChartBarProps } from './schema'
import { trustedViewerHtml } from '@easyink/core'
import { renderEChartsSvg } from '@easyink/material-chart-kernel'
import { getNodeProps } from '@easyink/schema'
import { UNIT_FACTOR } from '@easyink/shared'
import { resolveChartBarRuntimeData } from './data-contract'
import { createChartBarRuntimeOptionFromData } from './options'

export function renderChartBar(node: MaterialNode, context?: ViewerRenderContext) {
  const props = getNodeProps<ChartBarProps>(node)
  const resolvedData = resolveChartBarRuntimeData(node, props, context?.data ?? {})
  for (const diagnostic of resolvedData.diagnostics)
    context?.reportDiagnostic?.({ ...diagnostic, nodeId: node.id })

  const option = createChartBarRuntimeOptionFromData(props, resolvedData.data)
  const pxFactor = 96 / (UNIT_FACTOR[context?.unit ?? 'mm'] ?? 25.4)
  const svg = renderEChartsSvg(option, node.width * pxFactor, node.height * pxFactor)

  return {
    html: trustedViewerHtml(`<div style="width:100%;height:100%;overflow:hidden;background:${props.backgroundColor || '#ffffff'}">${svg}</div>`),
  }
}
