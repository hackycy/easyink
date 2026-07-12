import type { MaterialNode } from '@easyink/schema'
import { canonicalizeMaterialNode } from '@easyink/schema'
import { convertUnit, generateId } from '@easyink/shared'

export const SVG_CUSTOM_TYPE = 'svg-custom'

export interface SvgCustomProps {
  content: string
}

export const SVG_CUSTOM_DEFAULTS: SvgCustomProps = {
  content: '',
}

export const SVG_CUSTOM_CAPABILITIES = {
  bindable: true,
  rotatable: true,
  resizable: true,
  supportsChildren: false,
  supportsAnimation: true,
  supportsUnionDrop: false,
  multiBinding: false,
}

export function createSvgCustomNode(partial?: Partial<MaterialNode>, unit?: string): MaterialNode {
  const c = unit && unit !== 'mm' ? (value: number) => convertUnit(value, 'mm', unit) : (value: number) => value
  const partialNode = partial ? { ...partial } : undefined
  const inputProps = (partial?.model ?? {}) as Partial<Record<string, unknown>>
  const partialModel: Partial<SvgCustomProps> = typeof inputProps.content === 'string'
    ? { content: inputProps.content }
    : {}

  if (partialNode)
    delete partialNode.model

  return canonicalizeMaterialNode(SVG_CUSTOM_TYPE, {
    id: generateId('svgc'),
    type: SVG_CUSTOM_TYPE,
    x: 0,
    y: 0,
    width: c(100),
    height: c(100),
    model: {
      ...SVG_CUSTOM_DEFAULTS,
      ...partialModel,
    },
    ...partialNode,
  })
}
