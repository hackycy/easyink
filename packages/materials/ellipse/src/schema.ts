import type { MaterialConditionDefinition } from '@easyink/core'
import type { MaterialNode } from '@easyink/schema'
import { canonicalizeMaterialNode } from '@easyink/schema'
import { convertUnit, generateId } from '@easyink/shared'

export const ELLIPSE_CONDITION: MaterialConditionDefinition = { scope: 'node', hiddenEffects: ['remove', 'reserve'] }

export const ELLIPSE_TYPE = 'ellipse'

export interface EllipseProps {
  fillColor: string
  borderWidth: number
  borderColor: string
  borderType: 'solid' | 'dashed' | 'dotted'
}

export const ELLIPSE_DEFAULTS: EllipseProps = {
  fillColor: 'transparent',
  borderWidth: 0.26,
  borderColor: '#000000',
  borderType: 'solid',
}

export function createEllipseNode(partial?: Partial<MaterialNode>, unit?: string): MaterialNode {
  const c = unit && unit !== 'mm' ? (v: number) => convertUnit(v, 'mm', unit) : (v: number) => v
  const partialNode = partial ? { ...partial } : undefined
  const partialModel = (partial?.model ?? {}) as Partial<EllipseProps>

  if (partialNode)
    delete partialNode.model

  return canonicalizeMaterialNode(ELLIPSE_TYPE, {
    id: generateId('ell'),
    type: ELLIPSE_TYPE,
    x: 0,
    y: 0,
    width: c(100),
    height: c(80),
    model: {
      ...ELLIPSE_DEFAULTS,
      borderWidth: c(ELLIPSE_DEFAULTS.borderWidth),
      ...partialModel,
    },
    ...partialNode,
  })
}

export const ELLIPSE_CAPABILITIES = {
  bindable: false,
  rotatable: true,
  resizable: true,
  supportsChildren: false,
  supportsAnimation: true,
  supportsUnionDrop: false,
  multiBinding: false,
}
