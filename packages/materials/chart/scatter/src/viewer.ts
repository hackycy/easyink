import type { ViewerRenderContext } from '@easyink/core'
import type { MaterialNode } from '@easyink/schema'
import type { ChartScatterProps } from './schema'
import { trustedViewerHtml } from '@easyink/core'
import { renderEChartsSvg } from '@easyink/material-chart-kernel'
import { getNodeProps } from '@easyink/schema'
import { UNIT_FACTOR } from '@easyink/shared'
import { resolveChartScatterRuntimeData } from './data-contract'
import { createChartScatterRuntimeOptionFromData } from './options'

export function renderChartScatter(node: MaterialNode, context?: ViewerRenderContext) {
  const props = getNodeProps<ChartScatterProps>(node)
  const resolvedData = resolveChartScatterRuntimeData(node, props, context?.data ?? {})
  for (const diagnostic of resolvedData.diagnostics)
    context?.reportDiagnostic?.({ ...diagnostic, nodeId: node.id })

  const option = createChartScatterRuntimeOptionFromData(props, resolvedData.data)
  const pxFactor = 96 / (UNIT_FACTOR[context?.unit ?? 'mm'] ?? 25.4)
  const svg = renderEChartsSvg(option, node.width * pxFactor, node.height * pxFactor)
  const backgroundStyle = props.backgroundColor ? `background:${props.backgroundColor};` : ''

  return {
    html: trustedViewerHtml(`<div style="width:100%;height:100%;overflow:hidden;${backgroundStyle}">${svg}</div>`),
  }
}
