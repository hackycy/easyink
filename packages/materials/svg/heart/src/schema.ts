import type { MaterialNode } from '@easyink/schema'
import { canonicalizeMaterialNode } from '@easyink/schema'
import { convertUnit, generateId } from '@easyink/shared'

export const SVG_HEART_TYPE = 'svg-heart'

export interface SvgHeartProps {
  fillColor: string
  borderWidth: number
  borderColor: string
}

export const SVG_HEART_DEFAULTS: SvgHeartProps = {
  fillColor: '#E5484D',
  borderWidth: 0,
  borderColor: '#000000',
}

export const SVG_HEART_CAPABILITIES = {
  bindable: false,
  rotatable: true,
  resizable: true,
  supportsChildren: false,
  supportsAnimation: true,
  supportsUnionDrop: false,
  multiBinding: false,
}

export function createSvgHeartNode(partial?: Partial<MaterialNode>, unit?: string): MaterialNode {
  const c = unit && unit !== 'mm' ? (value: number) => convertUnit(value, 'mm', unit) : (value: number) => value
  const partialNode = partial ? { ...partial } : undefined
  const partialModel = (partial?.model ?? {}) as Partial<SvgHeartProps>

  if (partialNode)
    delete partialNode.model

  return canonicalizeMaterialNode(SVG_HEART_TYPE, {
    id: generateId('svgh'),
    type: SVG_HEART_TYPE,
    x: 0,
    y: 0,
    width: c(100),
    height: c(90),
    model: {
      ...SVG_HEART_DEFAULTS,
      ...partialModel,
    },
    ...partialNode,
  })
}
