import type { ScenarioTemplate } from './types'

export const invoiceTemplate: ScenarioTemplate = {
  id: 'invoice',
  name: '发票/单据',
  triggers: ['发票', 'invoice', '单据', '出货单', '送货单', '出库单', '入库单'],
  relevantMaterials: ['text', 'table-data', 'table-static', 'image', 'barcode', 'qrcode', 'line', 'rect', 'page-number'],
  skeleton: {
    page: { mode: 'fixed', width: 210, height: 297 },
    regions: [
      { id: 'header', role: 'title-and-logo', yRange: [8, 30], materials: ['text', 'image'] },
      { id: 'info', role: 'key-value-pairs', yRange: [30, 65], materials: ['text', 'table-static'] },
      { id: 'items', role: 'data-list', yRange: [65, 210], materials: ['table-data'] },
      { id: 'summary', role: 'totals', yRange: [210, 240], materials: ['text', 'table-static'] },
      { id: 'footer', role: 'notes-and-codes', yRange: [240, 285], materials: ['text', 'barcode', 'qrcode'] },
    ],
  },
  variations: [
    { condition: 'has logo field', adjust: 'add image to header region', action: s => s },
    { condition: 'items > 15 columns', adjust: 'reduce font size', action: s => s },
    { condition: 'multi-page', adjust: 'add page-number to footer', action: s => s },
  ],
}

export const receiptTemplate: ScenarioTemplate = {
  id: 'receipt',
  name: '收据/小票',
  triggers: ['收据', '小票', 'receipt', '零售', '结账', '消费'],
  relevantMaterials: ['text', 'flow-row', 'table-data', 'line', 'barcode', 'qrcode'],
  skeleton: {
    page: { mode: 'continuous', width: 72, height: 200 },
    regions: [
      { id: 'header', role: 'shop-info', yRange: [2, 20], materials: ['text'] },
      { id: 'separator1', role: 'divider', yRange: [20, 21], materials: ['line'] },
      { id: 'items', role: 'item-list', yRange: [21, 120], materials: ['flow-row', 'table-data'] },
      { id: 'separator2', role: 'divider', yRange: [120, 121], materials: ['line'] },
      { id: 'summary', role: 'totals', yRange: [121, 145], materials: ['text'] },
      { id: 'footer', role: 'codes-and-notes', yRange: [145, 190], materials: ['text', 'barcode', 'qrcode'] },
    ],
  },
  variations: [
    { condition: 'narrow width < 58mm', adjust: 'use 58mm width', action: s => ({ ...s, page: { ...s.page, width: 58 } }) },
    { condition: 'has payment QR', adjust: 'add qrcode to footer', action: s => s },
  ],
}

export const reportTemplate: ScenarioTemplate = {
  id: 'report',
  name: '报表/报告',
  triggers: ['报表', '报告', 'report', '统计', '分析', '汇总'],
  relevantMaterials: ['text', 'table-data', 'table-static', 'chart', 'image', 'page-number', 'rect'],
  skeleton: {
    page: { mode: 'fixed', width: 210, height: 297 },
    regions: [
      { id: 'header', role: 'report-title', yRange: [10, 35], materials: ['text', 'image'] },
      { id: 'summary', role: 'key-metrics', yRange: [35, 70], materials: ['text', 'table-static'] },
      { id: 'chart', role: 'visualization', yRange: [70, 170], materials: ['chart'], optional: true },
      { id: 'details', role: 'data-table', yRange: [170, 270], materials: ['table-data'] },
      { id: 'footer', role: 'page-info', yRange: [275, 290], materials: ['text', 'page-number'] },
    ],
  },
  variations: [
    { condition: 'no chart data', adjust: 'remove chart region, expand details', action: s => s },
    { condition: 'multi-page', adjust: 'add page-number', action: s => s },
  ],
}

export const labelTemplate: ScenarioTemplate = {
  id: 'label',
  name: '标签',
  triggers: ['标签', 'label', '贴纸', '条码标签', '物流标签', '快递'],
  relevantMaterials: ['text', 'barcode', 'qrcode', 'image', 'rect', 'line'],
  skeleton: {
    page: { mode: 'fixed', width: 100, height: 60 },
    regions: [
      { id: 'title', role: 'product-name', yRange: [2, 15], materials: ['text'] },
      { id: 'codes', role: 'barcode-qrcode', yRange: [15, 45], materials: ['barcode', 'qrcode'] },
      { id: 'info', role: 'details', yRange: [45, 58], materials: ['text'] },
    ],
  },
  variations: [
    { condition: 'shipping label', adjust: 'use 100x150mm size', action: s => ({ ...s, page: { ...s.page, height: 150 } }) },
    { condition: 'small product label', adjust: 'use 50x30mm size', action: s => ({ ...s, page: { ...s.page, width: 50, height: 30 } }) },
  ],
}
