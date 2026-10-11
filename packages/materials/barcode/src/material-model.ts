import type { MaterialModel } from '@easyink/plugin-api/material'
import { BARCODE_CAPABILITIES, BARCODE_TYPE, createBarcodeNode } from './schema'

export const barcodeModel = {
  type: BARCODE_TYPE,
  createDefaultNode: createBarcodeNode,
  capabilities: BARCODE_CAPABILITIES,
  binding: {
    kind: 'ordinary',
    primaryProp: 'value',
    indexedProps: { 0: 'value', 1: 'format', 2: 'params' },
    formatEditor: { tabs: ['preset', 'custom'], defaultTab: 'preset' },
  },
} satisfies MaterialModel
