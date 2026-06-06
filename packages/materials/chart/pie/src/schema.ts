import type { MaterialNode } from '@easyink/schema'
import { convertUnit, generateId } from '@easyink/shared'

export const CHART_PIE_TYPE = 'chart-pie'

export type ChartPiePalettePreset = 'classic' | 'business' | 'pastel'

export interface ChartPieProps {
  palettePreset: ChartPiePalettePreset
  backgroundColor: string
  labelColor: string
  showValueLabels: boolean
  showLegend: boolean
  innerRadiusPercent: number
}

export const CHART_PIE_DEFAULTS: ChartPieProps = {
  palettePreset: 'classic',
  backgroundColor: '#ffffff',
  labelColor: '#374151',
  showValueLabels: true,
  showLegend: true,
  innerRadiusPercent: 0,
}

export const CHART_PIE_CAPABILITIES = {
  bindable: true,
  rotatable: true,
  resizable: true,
  supportsChildren: false,
  supportsAnimation: false,
  supportsUnionDrop: false,
  multiBinding: false,
}

export function createChartPieNode(partial?: Partial<MaterialNode>, unit?: string): MaterialNode {
  const c = unit && unit !== 'mm' ? (value: number) => convertUnit(value, 'mm', unit) : (value: number) => value
  const partialNode = partial ? { ...partial } : undefined
  const partialProps = (partial?.props ?? {}) as Partial<ChartPieProps>

  if (partialNode)
    delete partialNode.props

  return {
    id: generateId('chartp'),
    type: CHART_PIE_TYPE,
    x: 0,
    y: 0,
    width: c(120),
    height: c(100),
    props: {
      ...CHART_PIE_DEFAULTS,
      ...partialProps,
    },
    ...partialNode,
  }
}
