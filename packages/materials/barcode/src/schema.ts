import type { MaterialNode } from '@easyink/schema'
import { convertUnit, generateId } from '@easyink/shared'

export const BARCODE_TYPE = 'barcode'

export const BARCODE_FORMATS = [
  { label: 'CODE128', value: 'CODE128', sampleValue: 'EasyInk' },
  { label: 'CODE128A', value: 'CODE128A', sampleValue: 'EASYINK123' },
  { label: 'CODE128B', value: 'CODE128B', sampleValue: 'EasyInk123' },
  { label: 'CODE128C', value: 'CODE128C', sampleValue: '12345678' },
  { label: 'EAN13', value: 'EAN13', sampleValue: '5901234123457' },
  { label: 'EAN8', value: 'EAN8', sampleValue: '96385074' },
  { label: 'EAN5', value: 'EAN5', sampleValue: '12345' },
  { label: 'EAN2', value: 'EAN2', sampleValue: '12' },
  { label: 'UPC', value: 'UPC', sampleValue: '123456789012' },
  { label: 'UPCE', value: 'UPCE', sampleValue: '12345670' },
  { label: 'CODE39', value: 'CODE39', sampleValue: 'EASYINK' },
  { label: 'ITF', value: 'ITF', sampleValue: '123456' },
  { label: 'ITF14', value: 'ITF14', sampleValue: '98765432109213' },
  { label: 'MSI', value: 'MSI', sampleValue: '1234567' },
  { label: 'MSI10', value: 'MSI10', sampleValue: '1234567' },
  { label: 'MSI11', value: 'MSI11', sampleValue: '1234567' },
  { label: 'MSI1010', value: 'MSI1010', sampleValue: '1234567' },
  { label: 'MSI1110', value: 'MSI1110', sampleValue: '1234567' },
  { label: 'Pharmacode', value: 'pharmacode', sampleValue: '1234' },
  { label: 'Codabar', value: 'codabar', sampleValue: 'A123456A' },
  { label: 'CODE93', value: 'CODE93', sampleValue: 'EASYINK' },
] as const

export type BarcodeFormat = typeof BARCODE_FORMATS[number]['value']

export interface BarcodeProps {
  value: string
  format: BarcodeFormat
  showText: boolean
  lineWidth: number
  lineColor: string
  backgroundColor: string
  borderWidth: number
  borderColor: string
  borderType: 'solid' | 'dashed' | 'dotted'
}

export const BARCODE_DEFAULTS: BarcodeProps = {
  value: '',
  format: 'CODE128',
  showText: true,
  lineWidth: 2,
  lineColor: '#000000',
  backgroundColor: '#ffffff',
  borderWidth: 0,
  borderColor: '#000000',
  borderType: 'solid',
}

export function resolveBarcodeProps(node: MaterialNode): BarcodeProps {
  const props = { ...BARCODE_DEFAULTS, ...node.props }
  return {
    ...props,
    format: props.format || BARCODE_DEFAULTS.format,
    lineWidth: props.lineWidth || BARCODE_DEFAULTS.lineWidth,
    lineColor: props.lineColor || BARCODE_DEFAULTS.lineColor,
    backgroundColor: props.backgroundColor || BARCODE_DEFAULTS.backgroundColor,
    borderColor: props.borderColor || BARCODE_DEFAULTS.borderColor,
    borderType: props.borderType || BARCODE_DEFAULTS.borderType,
  }
}

export function createBarcodeNode(partial?: Partial<MaterialNode>, unit?: string): MaterialNode {
  const c = unit && unit !== 'mm' ? (v: number) => convertUnit(v, 'mm', unit) : (v: number) => v
  const { props, ...rest } = partial ?? {}
  return {
    id: generateId('bc'),
    type: BARCODE_TYPE,
    x: 0,
    y: 0,
    width: c(150),
    height: c(60),
    ...rest,
    props: { ...BARCODE_DEFAULTS, ...props },
  }
}

export const BARCODE_CAPABILITIES = {
  bindable: true,
  rotatable: true,
  resizable: true,
  supportsChildren: false,
  supportsAnimation: false,
  supportsUnionDrop: false,
  multiBinding: true,
}
