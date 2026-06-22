import type { DocumentSchema } from '@easyink/schema'
import { SCHEMA_VERSION } from '@easyink/shared'

export const conditionalQrcodeDemoData: Record<string, unknown> = {
  parentQrcode: 'https://easyink.example/parent',
  qrCode: 'https://easyink.example/fallback',
}

export const conditionalQrcodeTemplate: DocumentSchema = {
  version: SCHEMA_VERSION,
  unit: 'mm',
  page: { mode: 'fixed', width: 80, height: 60 },
  guides: { x: [], y: [] },
  elements: [
    {
      id: 'parent-qrcode',
      type: 'qrcode',
      x: 25,
      y: 15,
      width: 30,
      height: 30,
      props: { value: '', size: 30, errorCorrectionLevel: 'M', foreground: '#111111', background: '#ffffff', borderWidth: 0, borderColor: '#000000', borderType: 'solid' },
      binding: { sourceId: 'demo', fieldPath: 'parentQrcode', fieldLabel: '主二维码' },
      renderCondition: {
        rule: { kind: 'compare', operator: 'exists', operands: [{ kind: 'field', path: 'parentQrcode' }] },
        whenFalse: 'remove',
      },
    },
    {
      id: 'fallback-qrcode',
      type: 'qrcode',
      x: 25,
      y: 15,
      width: 30,
      height: 30,
      props: { value: '', size: 30, errorCorrectionLevel: 'M', foreground: '#1677ff', background: '#ffffff', borderWidth: 0, borderColor: '#000000', borderType: 'solid' },
      binding: { sourceId: 'demo', fieldPath: 'qrCode', fieldLabel: '备用二维码' },
      renderCondition: {
        rule: {
          kind: 'group',
          operator: 'and',
          children: [
            { kind: 'compare', operator: 'notExists', operands: [{ kind: 'field', path: 'parentQrcode' }] },
            { kind: 'compare', operator: 'exists', operands: [{ kind: 'field', path: 'qrCode' }] },
          ],
        },
        whenFalse: 'remove',
      },
    },
  ],
}
