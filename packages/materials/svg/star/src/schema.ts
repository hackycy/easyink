import type { MaterialNode } from '@easyink/schema'
import { canonicalizeMaterialNode } from '@easyink/schema'
import { convertUnit, generateId } from '@easyink/shared'

export const SVG_STAR_TYPE = 'svg-star'

export interface SvgStarProps {
  fillColor: string
  borderWidth: number
  borderColor: string
  starPoints: number
  starInnerRatio: number
  starRotation: number
}

export interface SvgStarControlSelection {
  handle: 'inner-radius'
  index: number
}

export const SVG_STAR_DEFAULTS: SvgStarProps = {
  fillColor: 'transparent',
  borderWidth: 0.26,
  borderColor: '#000000',
  starPoints: 5,
  starInnerRatio: 0.381966,
  starRotation: -90,
}

export const SVG_STAR_CAPABILITIES = {
  bindable: false,
  rotatable: true,
  resizable: true,
  supportsChildren: false,
  supportsAnimation: true,
  supportsUnionDrop: false,
  multiBinding: false,
}

export function createSvgStarNode(partial?: Partial<MaterialNode>, unit?: string): MaterialNode {
  const c = unit && unit !== 'mm' ? (value: number) => convertUnit(value, 'mm', unit) : (value: number) => value
  const partialNode = partial ? { ...partial } : undefined
  const partialModel = (partial?.model ?? {}) as Partial<SvgStarProps>

  if (partialNode)
    delete partialNode.model

  return canonicalizeMaterialNode(SVG_STAR_TYPE, {
    id: generateId('svgs'),
    type: SVG_STAR_TYPE,
    x: 0,
    y: 0,
    width: c(100),
    height: c(100),
    model: {
      ...SVG_STAR_DEFAULTS,
      borderWidth: c(SVG_STAR_DEFAULTS.borderWidth),
      ...partialModel,
    },
    ...partialNode,
  })
}
