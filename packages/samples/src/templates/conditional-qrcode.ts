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
      modelVersion: 1,
      x: 25,
      y: 15,
      width: 30,
      height: 30,
      model: { value: '', size: 30, errorCorrectionLevel: 'M', foreground: '#111111', background: '#ffffff', borderWidth: 0, borderColor: '#000000', borderType: 'solid' },
      bindings: {
        value: { sourceId: 'demo', fieldPath: 'parentQrcode', fieldLabel: '主二维码' },
      },
      output: {
        visibility: 'include',
        renderCondition: {
          whenMatched: 'show',
          whenHidden: 'remove',
          groups: [{ conditions: [{ source: { path: 'parentQrcode', fieldLabel: '主二维码' }, operator: { compare: 'exists' } }] }],
        },
      },
      slots: {},
    },
    {
      id: 'fallback-qrcode',
      type: 'qrcode',
      modelVersion: 1,
      x: 25,
      y: 15,
      width: 30,
      height: 30,
      model: { value: '', size: 30, errorCorrectionLevel: 'M', foreground: '#1677ff', background: '#ffffff', borderWidth: 0, borderColor: '#000000', borderType: 'solid' },
      bindings: {
        value: { sourceId: 'demo', fieldPath: 'qrCode', fieldLabel: '备用二维码' },
      },
      output: {
        visibility: 'include',
        renderCondition: {
          whenMatched: 'show',
          whenHidden: 'remove',
          groups: [{ conditions: [
            { source: { path: 'parentQrcode', fieldLabel: '主二维码' }, operator: { compare: 'notExists' } },
            { source: { path: 'qrCode', fieldLabel: '备用二维码' }, operator: { compare: 'exists' } },
          ] }],
        },
      },
      slots: {},
    },
  ],
}
