import type { MaterialNode } from '@easyink/schema'
import { canonicalizeMaterialNode } from '@easyink/schema'
import { convertUnit, generateId } from '@easyink/shared'

export const PAGE_NUMBER_TYPE = 'page-number'

export interface PageNumberProps {
  format: string
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
}

export const PAGE_NUMBER_DEFAULTS: PageNumberProps = {
  format: '{current}/{total}',
  fontSize: 3.53,
  fontFamily: '',
  fontWeight: 'normal',
  fontStyle: 'normal',
  color: '#000000',
  backgroundColor: '',
  textAlign: 'center',
  verticalAlign: 'middle',
  lineHeight: 1.5,
  letterSpacing: 0,
}

export function createPageNumberNode(partial?: Partial<MaterialNode>, unit?: string): MaterialNode {
  const c = unit && unit !== 'mm' ? (v: number) => convertUnit(v, 'mm', unit) : (v: number) => v
  const { model: inputModel, output, ...envelope } = partial ?? {}
  return canonicalizeMaterialNode(PAGE_NUMBER_TYPE, {
    id: generateId('pgnum'),
    type: PAGE_NUMBER_TYPE,
    x: 0,
    y: 0,
    width: c(26),
    height: c(8),
    model: {
      ...PAGE_NUMBER_DEFAULTS,
      fontSize: c(PAGE_NUMBER_DEFAULTS.fontSize),
      letterSpacing: c(PAGE_NUMBER_DEFAULTS.letterSpacing),
      ...inputModel,
    },
    ...envelope,
    output: {
      ...output,
      visibility: 'include',
      placement: { mode: 'fixed' },
    },
  })
}

export const PAGE_NUMBER_CAPABILITIES = {
  bindable: false,
  rotatable: false,
  resizable: true,
  supportsChildren: false,
  supportsAnimation: false,
  multiBinding: false,
}
