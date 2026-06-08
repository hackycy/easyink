import type { MaterialNode } from '@easyink/schema'
import { convertUnit, generateId } from '@easyink/shared'

export const CHART_CUSTOM_TYPE = 'chart-custom'

export interface ChartCustomProps {
  optionCode: string
  option: unknown
  backgroundColor: string
}

export const CHART_CUSTOM_DEFAULT_OPTION_CODE = `return {
  tooltip: {},
  xAxis: { type: 'category', data: ['A', 'B', 'C'] },
  yAxis: { type: 'value' },
  series: [{ type: 'bar', data: [12, 20, 15] }]
}`

export const CHART_CUSTOM_DEFAULTS: ChartCustomProps = {
  optionCode: CHART_CUSTOM_DEFAULT_OPTION_CODE,
  option: null,
  backgroundColor: '',
}

export const CHART_CUSTOM_CAPABILITIES = {
  bindable: true,
  rotatable: true,
  resizable: true,
  supportsChildren: false,
  supportsAnimation: false,
  supportsUnionDrop: false,
  multiBinding: false,
}

export function createChartCustomNode(partial?: Partial<MaterialNode>, unit?: string): MaterialNode {
  const c = unit && unit !== 'mm' ? (value: number) => convertUnit(value, 'mm', unit) : (value: number) => value
  const partialNode = partial ? { ...partial } : undefined
  const partialProps = (partial?.props ?? {}) as Partial<ChartCustomProps>

  if (partialNode)
    delete partialNode.props

  return {
    id: generateId('chartc'),
    type: CHART_CUSTOM_TYPE,
    x: 0,
    y: 0,
    width: c(160),
    height: c(90),
    props: {
      ...CHART_CUSTOM_DEFAULTS,
      ...partialProps,
    },
    ...partialNode,
  }
}
