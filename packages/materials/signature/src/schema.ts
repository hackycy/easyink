import type { MaterialConditionDefinition } from '@easyink/core'
import type { MaterialNode } from '@easyink/schema'
import { canonicalizeMaterialNode, getNodeModel } from '@easyink/schema'
import { convertUnit, generateId } from '@easyink/shared'

export const SIGNATURE_CONDITION: MaterialConditionDefinition = { scope: 'node', hiddenEffects: ['remove', 'reserve'] }

export const SIGNATURE_TYPE = 'signature'

export interface SignaturePoint {
  x: number
  y: number
  pressure: number
  time: number
}

export interface SignaturePointGroup {
  penColor: string
  dotSize: number
  minWidth: number
  maxWidth: number
  velocityFilterWeight: number
  compositeOperation: GlobalCompositeOperation
  points: SignaturePoint[]
}

export interface SignatureProps {
  backgroundColor: string
  penColor: string
  data: SignaturePointGroup[]
}

export const SIGNATURE_DEFAULTS: SignatureProps = {
  backgroundColor: 'transparent',
  penColor: '#111827',
  data: [],
}

export function getSignatureProps(node: MaterialNode): SignatureProps {
  const props = getNodeModel<Partial<SignatureProps>>(node)
  return {
    ...SIGNATURE_DEFAULTS,
    ...props,
    data: Array.isArray(props.data) ? props.data : [],
  }
}

export function createSignatureNode(partial?: Partial<MaterialNode>, unit?: string): MaterialNode {
  const c = unit && unit !== 'mm' ? (v: number) => convertUnit(v, 'mm', unit) : (v: number) => v
  const partialNode = partial ? { ...partial } : undefined
  const partialModel = (partial?.model ?? {}) as Partial<SignatureProps>

  if (partialNode)
    delete partialNode.model

  return canonicalizeMaterialNode(SIGNATURE_TYPE, {
    id: generateId('sig'),
    type: SIGNATURE_TYPE,
    x: 0,
    y: 0,
    width: c(80),
    height: c(35),
    model: {
      ...SIGNATURE_DEFAULTS,
      ...partialModel,
      data: Array.isArray(partialModel.data) ? partialModel.data : [],
    },
    ...partialNode,
  })
}

export const SIGNATURE_CAPABILITIES = {
  bindable: false,
  rotatable: false,
  resizable: true,
  supportsChildren: false,
  supportsAnimation: false,
  supportsUnionDrop: false,
  multiBinding: false,
}
