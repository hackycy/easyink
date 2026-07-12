import type { ViewerRenderContext } from '@easyink/core'
import type { MaterialNode } from '@easyink/schema'
import type { ChartCustomProps } from './schema'
import { viewerElement, viewerSanitizedMarkup } from '@easyink/core'
import { renderFullEChartsSvg } from '@easyink/material-chart-kernel/full'
import { getBindingRefs, getNodeModel } from '@easyink/schema'
import { UNIT_FACTOR } from '@easyink/shared'
import { resolveChartCustomOption, resolveChartCustomProps } from './options'

export function renderChartCustom(node: MaterialNode, context: ViewerRenderContext) {
  const props = resolveChartCustomProps(getNodeModel<ChartCustomProps>(node))
  const result = resolveChartCustomOption(props, {
    data: context.data ?? {},
    boundOption: context.resolvedProps?.option,
    hasBinding: getBindingRefs(node.bindings.value).length > 0,
    node,
    width: node.width,
    height: node.height,
    unit: context.unit ?? 'mm',
  })
  for (const diagnostic of result.diagnostics)
    context.reportDiagnostic?.({ ...diagnostic, nodeId: node.id })

  const pxFactor = 96 / (UNIT_FACTOR[context.unit ?? 'mm'] ?? 25.4)
  const svg = renderFullEChartsSvg(result.option, node.width * pxFactor, node.height * pxFactor)
  return {
    tree: viewerElement('div', { style: { width: '100%', height: '100%', overflow: 'hidden', ...(props.backgroundColor ? { background: props.backgroundColor } : {}) } }, [
      viewerSanitizedMarkup(context.capabilities.sanitizeMarkup({ format: 'svg', source: svg })),
    ]),
  }
}
