import type { DocumentSchema } from '@easyink/schema'
import { SCHEMA_VERSION } from '@easyink/shared'

export * from './adapter'
export * from './datasources'

export interface SampleTemplateEntry {
  id: string
  name: string
  category: string
  thumbnail?: string
  schema: DocumentSchema
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
    mode: 'fixed',
    width: 210,
    height: 297,
  },
  guides: { x: [], y: [] },
  elements: [
    {
      id: 'invoice_title',
      type: 'text',
      x: 60,
      y: 15,
      width: 90,
      height: 12,
      props: {
        content: '发票',
        fontSize: 24,
        fontWeight: 'bold',
        textAlign: 'center',
        verticalAlign: 'middle',
        color: '#333333',
      },
    },
    {
      id: 'invoice_date',
      type: 'text',
      x: 140,
      y: 35,
      width: 60,
      height: 6,
      props: {
        content: '日期：____',
        fontSize: 10,
        textAlign: 'right',
        verticalAlign: 'middle',
        color: '#666666',
      },
    },
    {
      id: 'invoice_no',
      type: 'text',
      x: 10,
      y: 35,
      width: 60,
      height: 6,
      props: {
        content: '编号：____',
        fontSize: 10,
        textAlign: 'left',
        verticalAlign: 'middle',
        color: '#666666',
      },
    },
  ],
}

/**
 * 标签模板（多列）。
 */
export const labelTemplate: DocumentSchema = {
  version: SCHEMA_VERSION,
  unit: 'mm',
  page: {
    mode: 'label',
    width: 210,
    height: 40,
    label: {
      columns: 3,
      gap: 2,
    },
    copies: 9,
  },
  guides: { x: [], y: [] },
  elements: [
    {
      id: 'label_barcode',
      type: 'barcode',
      x: 5,
      y: 5,
      width: 55,
      height: 20,
      props: {
        value: '1234567890',
        format: 'CODE128',
        showText: true,
      },
    },
    {
      id: 'label_name',
      type: 'text',
      x: 5,
      y: 27,
      width: 55,
      height: 6,
      props: {
        content: '商品名称',
        fontSize: 9,
        textAlign: 'center',
      },
    },
  ],
}

/**
 * 收据模板（堆叠模式）。
 */
export const receiptTemplate: DocumentSchema = {
  version: SCHEMA_VERSION,
  unit: 'mm',
  page: {
    mode: 'stack',
    width: 80,
    height: 200,
  },
  guides: { x: [], y: [] },
  elements: [
    {
      id: 'receipt_header',
      type: 'text',
      x: 5,
      y: 5,
      width: 70,
      height: 8,
      props: {
        content: '收据',
        fontSize: 16,
        fontWeight: 'bold',
        textAlign: 'center',
      },
    },
    {
      id: 'receipt_line',
      type: 'line',
      x: 5,
      y: 16,
      width: 70,
      height: 0,
      props: {
        lineWidth: 1,
        lineColor: '#000000',
        lineType: 'dashed',
      },
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
    { name: '商品甲', qty: 10, price: 25.00, amount: 250.00 },
    { name: '商品乙', qty: 5, price: 40.00, amount: 200.00 },
    { name: '服务丙', qty: 1, price: 150.00, amount: 150.00 },
  ],
  grandTotal: 600.00,
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
    id: 'label-3col',
    name: '标签（三列）',
    category: 'label',
    schema: labelTemplate,
  },
  {
    id: 'receipt',
    name: '收据',
    category: 'receipt',
    schema: receiptTemplate,
  },
]
