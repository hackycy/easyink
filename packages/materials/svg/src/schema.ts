import type { MaterialNode } from '@easyink/schema'
import { generateId } from '@easyink/shared'

export const SVG_TYPE = 'svg'

export interface SvgProps {
  content: string
  viewBox: string
  preserveAspectRatio: string
  fillColor: string
}

export const SVG_DEFAULTS: SvgProps = {
  content: '',
  viewBox: '0 0 100 100',
  preserveAspectRatio: 'xMidYMid meet',
  fillColor: '#000000',
}

export function createSvgNode(partial?: Partial<MaterialNode>): MaterialNode {
  return {
    id: generateId('svg'),
    type: SVG_TYPE,
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    props: { ...SVG_DEFAULTS },
    ...partial,
  }
}

export const SVG_CAPABILITIES = {
  bindable: false,
  rotatable: true,
  resizable: true,
  supportsChildren: false,
  supportsAnimation: true,
  supportsUnionDrop: false,
  multiBinding: false,
}
