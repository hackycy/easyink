import type { MaterialNode } from '@easyink/schema'
import type { ChartProps } from './schema'

export function renderChart(node: MaterialNode) {
  const props = node.props as unknown as ChartProps

  return {
    html: `<div style="
      width: 100%;
      height: 100%;
      background: ${props.backgroundColor || 'transparent'};
      display: flex;
      align-items: center;
      justify-content: center;
    ">[Chart: ${props.chartType}]</div>`,
  }
}
