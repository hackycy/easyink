import type { MaterialConditionDefinition } from '@easyink/core'
import type { MaterialNode } from '@easyink/schema'
import { convertUnit, generateId } from '@easyink/shared'

export const IMAGE_CONDITION: MaterialConditionDefinition = { scope: 'node', effects: ['remove', 'reserve'] }

export const IMAGE_TYPE = 'image'

export interface ImageProps {
  src: string
  fit: 'contain' | 'cover' | 'fill' | 'none'
  alt: string
  backgroundColor: string
  borderWidth: number
  borderColor: string
  borderType: 'solid' | 'dashed' | 'dotted'
}

export const IMAGE_DEFAULTS: ImageProps = {
  src: '',
  fit: 'contain',
  alt: '',
  backgroundColor: '',
  borderWidth: 0,
  borderColor: '#000000',
  borderType: 'solid',
}

export function createImageNode(partial?: Partial<MaterialNode>, unit?: string): MaterialNode {
  const c = unit && unit !== 'mm' ? (v: number) => convertUnit(v, 'mm', unit) : (v: number) => v
  return {
    id: generateId('img'),
    type: IMAGE_TYPE,
    x: 0,
    y: 0,
    width: c(100),
    height: c(100),
    props: { ...IMAGE_DEFAULTS },
    ...partial,
  }
}

export const IMAGE_CAPABILITIES = {
  bindable: true,
  rotatable: true,
  resizable: true,
  supportsChildren: false,
  supportsAnimation: true,
  supportsUnionDrop: false,
  multiBinding: false,
}
