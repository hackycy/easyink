import type { MaterialNode } from '@easyink/schema'
import { generateId } from '@easyink/shared'

export const TEXT_TYPE = 'text'

export interface TextProps {
  content: string
  fontSize: number
  fontFamily: string
  fontWeight: string
  fontStyle: string
  color: string
  backgroundColor: string
  textAlign: 'left' | 'center' | 'right'
  verticalAlign: 'top' | 'middle' | 'bottom'
  lineHeight: number
  letterSpacing: number
  autoWrap: boolean
  overflow: 'visible' | 'hidden' | 'ellipsis'
  richText: boolean
  prefix: string
  suffix: string
}

export const TEXT_DEFAULTS: TextProps = {
  content: '',
  fontSize: 12,
  fontFamily: '',
  fontWeight: 'normal',
  fontStyle: 'normal',
  color: '#000000',
  backgroundColor: '',
  textAlign: 'center',
  verticalAlign: 'middle',
  lineHeight: 1.5,
  letterSpacing: 0,
  autoWrap: true,
  overflow: 'hidden',
  richText: false,
  prefix: '',
  suffix: '',
}

export function createTextNode(partial?: Partial<MaterialNode>): MaterialNode {
  return {
    id: generateId('text'),
    type: TEXT_TYPE,
    x: 0,
    y: 0,
    width: 80,
    height: 20,
    props: { ...TEXT_DEFAULTS },
    ...partial,
  }
}

export const TEXT_CAPABILITIES = {
  bindable: true,
  rotatable: true,
  resizable: true,
  supportsChildren: false,
  supportsAnimation: true,
  supportsUnionDrop: true,
  multiBinding: false,
}
