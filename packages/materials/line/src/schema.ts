import type { MaterialConditionDefinition } from '@easyink/core'
import type { MaterialNode } from '@easyink/schema'
import { canonicalizeMaterialNode, getNodeModel } from '@easyink/schema'
import { convertUnit, generateId } from '@easyink/shared'

export const LINE_CONDITION: MaterialConditionDefinition = { scope: 'node', hiddenEffects: ['remove', 'reserve'] }

export const LINE_TYPE = 'line'

export interface LineProps {
  lineColor: string
  lineType: 'solid' | 'dashed' | 'dotted'
}

export const LINE_DEFAULTS: LineProps = {
  lineColor: '#000000',
  lineType: 'solid',
}

function readPositiveNumber(value: unknown): number | null {
  const numeric = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null
}

export function getLineThickness(node: Pick<MaterialNode, 'height' | 'model'>): number {
  const height = readPositiveNumber(node.height)
  if (height != null)
    return height

  const legacyLineWidth = readPositiveNumber(getNodeModel<Record<string, unknown>>(node as MaterialNode).lineWidth)
  if (legacyLineWidth != null)
    return legacyLineWidth

  return 0.26
}

export function createLineNode(partial?: Partial<MaterialNode>, unit?: string): MaterialNode {
  const c = unit && unit !== 'mm' ? (v: number) => convertUnit(v, 'mm', unit) : (v: number) => v
  return canonicalizeMaterialNode(LINE_TYPE, {
    id: generateId('line'),
    type: LINE_TYPE,
    x: 0,
    y: 0,
    width: c(100),
    height: c(0.26),
    model: { ...LINE_DEFAULTS },
    ...partial,
  })
}

export const LINE_CAPABILITIES = {
  bindable: false,
  rotatable: true,
  resizable: true,
  supportsChildren: false,
  supportsAnimation: false,
  supportsUnionDrop: false,
  multiBinding: false,
}
