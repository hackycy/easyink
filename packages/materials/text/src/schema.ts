import type { AdaptableMaterialNode, MaterialConditionDefinition, SchemaMigration } from '@easyink/core'
import type { MaterialNode } from '@easyink/schema'
import { canonicalizeMaterialNode } from '@easyink/schema'
import { convertUnit, generateId } from '@easyink/shared'

export const TEXT_CONDITION: MaterialConditionDefinition = { scope: 'node', hiddenEffects: ['remove', 'reserve'] }

export const TEXT_TYPE = 'text'

export type TextHeightMode = 'fixed' | 'auto'
export type TextWrapMode = 'wrap' | 'nowrap' | 'anywhere'

export interface TextProps {
  content: string
  writingMode: 'horizontal' | 'vertical'
  heightMode: TextHeightMode
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
  wrapMode: TextWrapMode
  overflow: 'visible' | 'hidden' | 'ellipsis'
  minHeight: number | null
  maxHeight: number | null
  prefix: string
  suffix: string
  borderWidth: number
  borderColor: string
  borderType: 'solid' | 'dashed' | 'dotted'
}

export const TEXT_DEFAULTS: TextProps = {
  content: '',
  writingMode: 'horizontal',
  heightMode: 'fixed',
  fontSize: 4.23,
  fontFamily: '',
  fontWeight: 'normal',
  fontStyle: 'normal',
  color: '#000000',
  backgroundColor: '',
  textAlign: 'center',
  verticalAlign: 'middle',
  lineHeight: 1.5,
  letterSpacing: 0,
  wrapMode: 'anywhere',
  overflow: 'hidden',
  minHeight: null,
  maxHeight: null,
  prefix: '',
  suffix: '',
  borderWidth: 0,
  borderColor: '#000000',
  borderType: 'solid',
}

export const migrateTextModelV0ToV1: SchemaMigration = {
  from: 0,
  to: 1,
  migrate(node: AdaptableMaterialNode): AdaptableMaterialNode {
    const source = node.model as Partial<TextProps> & { autoWrap?: boolean }
    const { autoWrap, ...model } = source
    return {
      ...node,
      modelVersion: 1,
      model: {
        ...model,
        wrapMode: model.wrapMode ?? (autoWrap === false ? 'nowrap' : TEXT_DEFAULTS.wrapMode),
      },
    }
  },
}

export function createTextNode(partial?: Partial<MaterialNode>, unit?: string): MaterialNode {
  const c = unit && unit !== 'mm' ? (v: number) => convertUnit(v, 'mm', unit) : (v: number) => v
  const partialNode = partial ? { ...partial } : undefined
  const { autoWrap: _legacyAutoWrap, ...partialModel } = {
    ...((partial?.model ?? {}) as Partial<TextProps> & { autoWrap?: boolean }),
  }
  if (partialNode)
    delete partialNode.model

  return canonicalizeMaterialNode(TEXT_TYPE, {
    id: generateId('text'),
    type: TEXT_TYPE,
    x: 0,
    y: 0,
    width: c(80),
    height: c(20),
    model: {
      ...TEXT_DEFAULTS,
      fontSize: c(TEXT_DEFAULTS.fontSize),
      letterSpacing: c(TEXT_DEFAULTS.letterSpacing),
      ...partialModel,
    },
    ...partialNode,
  })
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
