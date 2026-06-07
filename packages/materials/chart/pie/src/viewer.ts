import type { ViewerRenderContext } from '@easyink/core'
import type { MaterialNode } from '@easyink/schema'
import type { ChartPieProps } from './schema'
import { trustedViewerHtml } from '@easyink/core'
import { renderEChartsSvg } from '@easyink/material-chart-kernel'
import { getNodeProps } from '@easyink/schema'
import { UNIT_FACTOR } from '@easyink/shared'
import { resolveChartPieRuntimeData } from './data-contract'
import { createChartPieRuntimeOptionFromData } from './options'

export function renderChartPie(node: MaterialNode, context?: ViewerRenderContext) {
  const props = getNodeProps<ChartPieProps>(node)
  const resolvedData = resolveChartPieRuntimeData(node, props, context?.data ?? {})
  for (const diagnostic of resolvedData.diagnostics)
    context?.reportDiagnostic?.({ ...diagnostic, nodeId: node.id })

  const option = createChartPieRuntimeOptionFromData(props, resolvedData.data)
  const pxFactor = 96 / (UNIT_FACTOR[context?.unit ?? 'mm'] ?? 25.4)
  const svg = renderEChartsSvg(option, node.width * pxFactor, node.height * pxFactor)
  const backgroundStyle = props.backgroundColor ? `background:${props.backgroundColor};` : ''

  return {
    html: trustedViewerHtml(`<div style="width:100%;height:100%;overflow:hidden;${backgroundStyle}">${svg}</div>`),
  }
}
