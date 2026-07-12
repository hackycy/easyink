import type { MaterialConditionDefinition } from '@easyink/core'
import type { MaterialNode } from '@easyink/schema'
import { canonicalizeMaterialNode } from '@easyink/schema'
import { convertUnit, generateId } from '@easyink/shared'

export const QRCODE_CONDITION: MaterialConditionDefinition = { scope: 'node', hiddenEffects: ['remove', 'reserve'] }

export const QRCODE_TYPE = 'qrcode'

export interface QrcodeProps {
  value: string
  size: number
  errorCorrectionLevel: 'L' | 'M' | 'Q' | 'H'
  foreground: string
  background: string
  borderWidth: number
  borderColor: string
  borderType: 'solid' | 'dashed' | 'dotted'
}

export const QRCODE_DEFAULTS: QrcodeProps = {
  value: '',
  size: 100,
  errorCorrectionLevel: 'M',
  foreground: '#000000',
  background: '#ffffff',
  borderWidth: 0,
  borderColor: '#000000',
  borderType: 'solid',
}

export function createQrcodeNode(partial?: Partial<MaterialNode>, unit?: string): MaterialNode {
  const c = unit && unit !== 'mm' ? (v: number) => convertUnit(v, 'mm', unit) : (v: number) => v
  const { model: inputModel, ...envelope } = partial ?? {}
  return canonicalizeMaterialNode(QRCODE_TYPE, {
    id: generateId('qr'),
    type: QRCODE_TYPE,
    x: 0,
    y: 0,
    width: c(100),
    height: c(100),
    ...envelope,
    model: { ...QRCODE_DEFAULTS, ...inputModel },
  })
}

export const QRCODE_CAPABILITIES = {
  bindable: true,
  rotatable: true,
  resizable: true,
  supportsChildren: false,
  supportsAnimation: false,
  supportsUnionDrop: false,
  multiBinding: false,
}
