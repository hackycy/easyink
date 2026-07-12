import type { MaterialNode } from '@easyink/schema'
import { canonicalizeMaterialNode } from '@easyink/schema'
import { convertUnit, generateId } from '@easyink/shared'

export const CHART_PIE_TYPE = 'chart-pie'

export type ChartPiePalettePreset
  = | 'product'
    | 'primer'
    | 'atlassian'
    | 'spectrum'
    | 'mint'
    | 'sunset'
    | 'aurora'
    | 'earth'
    | 'mono'

export interface ChartPieProps {
  palettePreset: ChartPiePalettePreset
  backgroundColor: string
  labelColor: string
  showValueLabels: boolean
  showLegend: boolean
  innerRadiusPercent: number
  sectorGapAngle: number
  sectorCornerRadius: number
}

export const CHART_PIE_DEFAULTS: ChartPieProps = {
  palettePreset: 'product',
  backgroundColor: '',
  labelColor: '#374151',
  showValueLabels: true,
  showLegend: true,
  innerRadiusPercent: 0,
  sectorGapAngle: 0,
  sectorCornerRadius: 0,
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
  const partialModel = (partial?.model ?? {}) as Partial<ChartPieProps>

  if (partialNode)
    delete partialNode.model

  return canonicalizeMaterialNode(CHART_PIE_TYPE, {
    id: generateId('chartp'),
    type: CHART_PIE_TYPE,
    x: 0,
    y: 0,
    width: c(120),
    height: c(100),
    model: {
      ...CHART_PIE_DEFAULTS,
      ...partialModel,
    },
    ...partialNode,
  })
}
