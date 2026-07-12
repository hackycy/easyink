import type { MaterialConditionDefinition } from '@easyink/core'
import type { MaterialNode } from '@easyink/schema'
import { canonicalizeMaterialNode } from '@easyink/schema'
import { convertUnit, generateId } from '@easyink/shared'

export const RECT_CONDITION: MaterialConditionDefinition = { scope: 'node', hiddenEffects: ['remove', 'reserve'] }

export const RECT_TYPE = 'rect'

export interface RectProps {
  fillColor: string
  borderWidth: number
  borderColor: string
  borderType: 'solid' | 'dashed' | 'dotted'
  borderRadius: number
}

export const RECT_DEFAULTS: RectProps = {
  fillColor: 'transparent',
  borderWidth: 0.26,
  borderColor: '#000000',
  borderType: 'solid',
  borderRadius: 0,
}

export function createRectNode(partial?: Partial<MaterialNode>, unit?: string): MaterialNode {
  const c = unit && unit !== 'mm' ? (v: number) => convertUnit(v, 'mm', unit) : (v: number) => v
  return canonicalizeMaterialNode(RECT_TYPE, {
    id: generateId('rect'),
    type: RECT_TYPE,
    x: 0,
    y: 0,
    width: c(100),
    height: c(60),
    model: {
      ...RECT_DEFAULTS,
      borderWidth: c(RECT_DEFAULTS.borderWidth),
    },
    ...partial,
  })
}

export const RECT_CAPABILITIES = {
  bindable: false,
  rotatable: true,
  resizable: true,
  supportsChildren: false,
  supportsAnimation: true,
  supportsUnionDrop: false,
  multiBinding: false,
}
