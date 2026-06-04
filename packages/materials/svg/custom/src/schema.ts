import type { MaterialNode } from '@easyink/schema'
import { convertUnit, generateId } from '@easyink/shared'

export const SVG_CUSTOM_TYPE = 'svg'

export interface SvgCustomProps {
  content: string
}

export const SVG_CUSTOM_DEFAULTS: SvgCustomProps = {
  content: '',
}

export const SVG_CUSTOM_CAPABILITIES = {
  bindable: false,
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
  const inputProps = (partial?.props ?? {}) as Partial<Record<string, unknown>>
  const partialProps: Partial<SvgCustomProps> = typeof inputProps.content === 'string'
    ? { content: inputProps.content }
    : {}

  if (partialNode)
    delete partialNode.props

  return {
    id: generateId('svgc'),
    type: SVG_CUSTOM_TYPE,
    x: 0,
    y: 0,
    width: c(100),
    height: c(100),
    props: {
      ...SVG_CUSTOM_DEFAULTS,
      ...partialProps,
    },
    ...partialNode,
  }
}
