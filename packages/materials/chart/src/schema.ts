import type { MaterialNode } from '@easyink/schema'
import { generateId } from '@easyink/shared'

export const CHART_TYPE = 'chart'

export interface ChartProps {
  chartType: 'bar' | 'line' | 'pie' | 'radar' | 'scatter'
  data: unknown
  options: Record<string, unknown>
  backgroundColor: string
}

export const CHART_DEFAULTS: ChartProps = {
  chartType: 'bar',
  data: null,
  options: {},
  backgroundColor: '#ffffff',
}

export function createChartNode(partial?: Partial<MaterialNode>): MaterialNode {
  return {
    id: generateId('chart'),
    type: CHART_TYPE,
    x: 0,
    y: 0,
    width: 200,
    height: 150,
    props: { ...CHART_DEFAULTS },
    ...partial,
  }
}

export const CHART_CAPABILITIES = {
  bindable: true,
  rotatable: false,
  resizable: true,
  supportsChildren: false,
  supportsAnimation: true,
  supportsUnionDrop: false,
  multiBinding: true,
}
