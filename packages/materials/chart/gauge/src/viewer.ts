import type { ViewerRenderContext } from '@easyink/core'
import type { MaterialNode } from '@easyink/schema'
import type { ChartGaugeProps } from './schema'
import { viewerElement, viewerSanitizedMarkup } from '@easyink/core'
import { renderEChartsSvg } from '@easyink/material-chart-kernel'
import { getNodeModel } from '@easyink/schema'
import { UNIT_FACTOR } from '@easyink/shared'
import { resolveChartGaugeRuntimeData } from './data-contract'
import { createChartGaugeRuntimeOptionFromData } from './options'

export function renderChartGauge(node: MaterialNode, context: ViewerRenderContext) {
  const props = getNodeModel<ChartGaugeProps>(node)
  const resolvedData = resolveChartGaugeRuntimeData(node, props, context.data ?? {})
  for (const diagnostic of resolvedData.diagnostics)
    context.reportDiagnostic?.({ ...diagnostic, nodeId: node.id })

  const option = createChartGaugeRuntimeOptionFromData(props, resolvedData.data)
  const pxFactor = 96 / (UNIT_FACTOR[context.unit ?? 'mm'] ?? 25.4)
  const svg = renderEChartsSvg(option, node.width * pxFactor, node.height * pxFactor)
  return { tree: viewerElement('div', { style: { width: '100%', height: '100%', overflow: 'hidden', ...(props.backgroundColor ? { background: props.backgroundColor } : {}) } }, [viewerSanitizedMarkup(context.capabilities.sanitizeMarkup({ format: 'svg', source: svg }))]) }
}
