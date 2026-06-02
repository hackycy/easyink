import type { ViewerRenderContext } from '@easyink/core'
import type { MaterialNode } from '@easyink/schema'
import type { ChartBarProps } from './schema'
import { trustedViewerHtml } from '@easyink/core'
import { renderEChartsSvg } from '@easyink/material-chart-kernel'
import { getNodeProps } from '@easyink/schema'
import { UNIT_FACTOR } from '@easyink/shared'
import { createChartBarRuntimeOption } from './options'

export function renderChartBar(node: MaterialNode, context?: ViewerRenderContext) {
  const props = getNodeProps<ChartBarProps>(node)
  const dataInput = readRuntimeData(props)
  const option = createChartBarRuntimeOption(props, dataInput)
  const pxFactor = 96 / (UNIT_FACTOR[context?.unit ?? 'mm'] ?? 25.4)
  const svg = renderEChartsSvg(option, node.width * pxFactor, node.height * pxFactor)

  return {
    html: trustedViewerHtml(`<div style="width:100%;height:100%;overflow:hidden;background:${props.backgroundColor || '#ffffff'}">${svg}</div>`),
  }
}

function readRuntimeData(props: ChartBarProps): unknown {
  const maybeResolved = props as ChartBarProps & { content?: unknown, data?: unknown }
  return maybeResolved.content ?? maybeResolved.data
}
