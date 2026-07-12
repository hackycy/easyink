import type { DocumentSchema } from '@easyink/schema'
import { SCHEMA_VERSION } from '@easyink/shared'
import { flowInvoiceTemplate } from './datasources'
import { badgeDemoData, badgeTemplate } from './templates/badge'
import { certificateDemoData, certificateTemplate } from './templates/certificate'
import { conditionalQrcodeDemoData, conditionalQrcodeTemplate } from './templates/conditional-qrcode'
import { salesReportDemoData, salesReportTemplate } from './templates/sales-report'
import { supermarketDemoData, supermarketFlexRowReceiptTemplate, supermarketReceiptTemplate } from './templates/supermarket-receipt'
import { vatElectronicInvoiceTemplate } from './templates/vat-electronic-invoice'
import { verticalMixedTextDemoData, verticalMixedTextTemplate } from './templates/vertical-mixed-text'

export * from './datasources'
export { badgeDataSource, badgeDemoData, badgeTemplate } from './templates/badge'
export { certificateDataSource, certificateDemoData, certificateTemplate } from './templates/certificate'
export { conditionalQrcodeDemoData, conditionalQrcodeTemplate } from './templates/conditional-qrcode'
export { salesReportDataSource, salesReportDemoData, salesReportTemplate } from './templates/sales-report'
export { supermarketDataSource, supermarketDemoData, supermarketFlexRowReceiptTemplate, supermarketReceiptTemplate } from './templates/supermarket-receipt'
export { vatElectronicInvoiceTemplate } from './templates/vat-electronic-invoice'
export { verticalMixedTextDataSource, verticalMixedTextDemoData, verticalMixedTextTemplate } from './templates/vertical-mixed-text'
export interface SampleTemplateEntry {
  id: string
  name: string
  category: string
  thumbnail?: string
  schema: DocumentSchema
  demoData?: Record<string, unknown>
}
/**
 * A4 空白模板。
 */
export const blankA4Template: DocumentSchema = {
  version: SCHEMA_VERSION,
  unit: 'mm',
  page: {
    mode: 'fixed',
    width: 210,
    height: 297,
  },
  guides: { x: [], y: [] },
  elements: [],
}
/**
 * 简单发票模板，含标题文本和数据表格占位。
 */
export const simpleInvoiceTemplate: DocumentSchema = {
  version: SCHEMA_VERSION,
  unit: 'mm',
  page: {
    mode: 'continuous',
    width: 210,
    height: 297,
    layout: { strategy: 'stack-flow', flowAxis: 'y' },
    pagination: { strategy: 'none' },
    reflow: { strategy: 'flow-y', preserveTrailingGap: true, collisionPolicy: 'diagnose' },
  },
  guides: { x: [], y: [] },
  elements: [
    {
      id: 'invoice_title',
      type: 'text',
      modelVersion: 1,
      x: 60,
      y: 15,
      width: 90,
      height: 12,
      model: {
        content: '发票',
        fontSize: 8.47,
        fontWeight: 'bold',
        textAlign: 'center',
        verticalAlign: 'middle',
        color: '#333333',
      },
      slots: {},
      bindings: {},
      output: { visibility: 'include' },
    },
    {
      id: 'invoice_date',
      type: 'text',
      modelVersion: 1,
      x: 140,
      y: 35,
      width: 60,
      height: 6,
      model: {
        content: '日期：____',
        fontSize: 3.53,
        textAlign: 'right',
        verticalAlign: 'middle',
        color: '#666666',
      },
      slots: {},
      bindings: {},
      output: { visibility: 'include' },
    },
    {
      id: 'invoice_no',
      type: 'text',
      modelVersion: 1,
      x: 10,
      y: 35,
      width: 60,
      height: 6,
      model: {
        content: '编号：____',
        fontSize: 3.53,
        textAlign: 'left',
        verticalAlign: 'middle',
        color: '#666666',
      },
      slots: {},
      bindings: {},
      output: { visibility: 'include' },
    },
  ],
}
/**
 * 收据模板（连续纸 + 流式布局）。
 */
export const receiptTemplate: DocumentSchema = {
  version: SCHEMA_VERSION,
  unit: 'mm',
  page: {
    mode: 'continuous',
    width: 80,
    height: 200,
    layout: { strategy: 'stack-flow', flowAxis: 'y' },
    pagination: { strategy: 'none' },
    reflow: { strategy: 'flow-y', preserveTrailingGap: true, collisionPolicy: 'diagnose' },
  },
  guides: { x: [], y: [] },
  elements: [
    {
      id: 'receipt_header',
      type: 'text',
      modelVersion: 1,
      x: 5,
      y: 5,
      width: 70,
      height: 8,
      model: {
        content: '收据',
        fontSize: 5.64,
        fontWeight: 'bold',
        textAlign: 'center',
      },
      slots: {},
      bindings: {},
      output: { visibility: 'include' },
    },
    {
      id: 'receipt_line',
      type: 'line',
      modelVersion: 1,
      x: 5,
      y: 16,
      width: 70,
      height: 1,
      model: {
        lineColor: '#000000',
        lineType: 'dashed',
      },
      slots: {},
      bindings: {},
      output: { visibility: 'include' },
    },
  ],
}
/**
 * 发票示例数据。
 */
export const invoiceDemoData: Record<string, unknown> = {
  company: {
    name: '示例科技有限公司',
    address: '北京市朝阳区示例街道123号',
  },
  invoice: {
    number: 'INV-2026-001',
    date: '2026-04-05',
  },
  customer: {
    name: '测试客户公司',
    address: '上海市浦东新区测试路456号',
  },
  items: [
    { name: '商品甲', qty: 10, price: 25.0, amount: 250.0 },
    { name: '商品乙', qty: 5, price: 40.0, amount: 200.0 },
    { name: '服务丙', qty: 1, price: 150.0, amount: 150.0 },
    { name: '服务丁', qty: 1, price: 120.0, amount: 120.0 },
  ],
  grandTotal: 600.0,
  notes: '请于30天内付款。谢谢惠顾！',
}
/**
 * 全部示例模板。
 */
export const sampleTemplates: SampleTemplateEntry[] = [
  {
    id: 'blank-a4',
    name: 'A4 空白',
    category: 'basic',
    schema: blankA4Template,
  },
  {
    id: 'simple-invoice',
    name: '简单发票',
    category: 'business',
    schema: simpleInvoiceTemplate,
  },
  {
    id: 'conditional-qrcode',
    name: '条件二维码',
    category: 'business',
    schema: conditionalQrcodeTemplate,
    demoData: conditionalQrcodeDemoData,
  },
  {
    id: 'vat-electronic-invoice',
    name: '增值税电子普通发票',
    category: 'business',
    schema: vatElectronicInvoiceTemplate,
  },
  {
    id: 'flow-invoice',
    name: '流式发票',
    category: 'business',
    schema: flowInvoiceTemplate,
    demoData: invoiceDemoData,
  },
  {
    id: 'receipt',
    name: '收据',
    category: 'receipt',
    schema: receiptTemplate,
  },
  {
    id: 'sales-report',
    name: '销售概览（柱状图）',
    category: 'business',
    schema: salesReportTemplate,
    demoData: salesReportDemoData,
  },
  {
    id: 'supermarket-receipt',
    name: '超市小票',
    category: 'receipt',
    schema: supermarketReceiptTemplate,
    demoData: supermarketDemoData,
  },
  {
    id: 'supermarket-receipt-flex-row',
    name: '超市小票（流动行）',
    category: 'receipt',
    schema: supermarketFlexRowReceiptTemplate,
    demoData: supermarketDemoData,
  },
  {
    id: 'certificate',
    name: '培训证书',
    category: 'certificate',
    schema: certificateTemplate,
    demoData: certificateDemoData,
  },
  {
    id: 'badge',
    name: '工牌',
    category: 'badge',
    schema: badgeTemplate,
    demoData: badgeDemoData,
  },
  {
    id: 'vertical-mixed-text',
    name: '竖排混排文本',
    category: 'typography',
    schema: verticalMixedTextTemplate,
    demoData: verticalMixedTextDemoData,
  },
]
