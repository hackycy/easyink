import type { ViewerRenderContext } from '@easyink/core'
import type { MaterialNode } from '@easyink/schema'
import type { ChartScatterProps } from './schema'
import { viewerElement, viewerSanitizedMarkup } from '@easyink/core'
import { renderEChartsSvg } from '@easyink/material-chart-kernel'
import { getNodeModel } from '@easyink/schema'
import { UNIT_FACTOR } from '@easyink/shared'
import { resolveChartScatterRuntimeData } from './data-contract'
import { createChartScatterRuntimeOptionFromData } from './options'

export function renderChartScatter(node: MaterialNode, context: ViewerRenderContext) {
  const props = getNodeModel<ChartScatterProps>(node)
  const resolvedData = resolveChartScatterRuntimeData(node, props, context.data ?? {})
  for (const diagnostic of resolvedData.diagnostics)
    context.reportDiagnostic?.({ ...diagnostic, nodeId: node.id })

  const option = createChartScatterRuntimeOptionFromData(props, resolvedData.data)
  const pxFactor = 96 / (UNIT_FACTOR[context.unit ?? 'mm'] ?? 25.4)
  const svg = renderEChartsSvg(option, node.width * pxFactor, node.height * pxFactor)
  return { tree: viewerElement('div', { style: { width: '100%', height: '100%', overflow: 'hidden', ...(props.backgroundColor ? { background: props.backgroundColor } : {}) } }, [viewerSanitizedMarkup(context.capabilities.sanitizeMarkup({ format: 'svg', source: svg }))]) }
}
