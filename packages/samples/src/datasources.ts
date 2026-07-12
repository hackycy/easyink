import type { DataFieldDisplayFormatConfig, DataSourceDescriptor } from '@easyink/datasource'
import type { DocumentSchema, MaterialNode } from '@easyink/schema'
import { SCHEMA_VERSION } from '@easyink/shared'
import { createSampleTableModel } from './sample-table'
import { badgeDataSource } from './templates/badge'
import { certificateDataSource } from './templates/certificate'
import { salesReportDataSource } from './templates/sales-report'
import { supermarketDataSource } from './templates/supermarket-receipt'
import { verticalMixedTextDataSource } from './templates/vertical-mixed-text'

const invoiceMoneyDisplayFormat: DataFieldDisplayFormatConfig = {
  defaultCustomTemplateId: 'invoice-money',
  customTemplates: [
    {
      id: 'invoice-money',
      label: '发票金额',
      hint: '金额保留两位小数并添加人民币符号',
      source: `function transform(value, data) {
  var num = Number(value)
  if (isNaN(num)) return ''
  return '￥' + num.toFixed(2)
}`,
    },
    {
      id: 'invoice-money-total',
      label: '合计金额',
      hint: '金额保留两位小数并加上合计前缀',
      source: `function transform(value, data) {
  var num = Number(value)
  if (isNaN(num)) return ''
  return '合计 ￥' + num.toFixed(2)
}`,
    },
  ],
}
const invoiceDateDisplayFormat: DataFieldDisplayFormatConfig = {
  defaultCustomTemplateId: 'invoice-date-cn',
  customTemplates: [
    {
      id: 'invoice-date-cn',
      label: '中文开票日期',
      hint: '把 YYYY-MM-DD 转成中文日期',
      source: `function transform(value, data) {
  if (value == null || value === '') return ''
  var text = String(value)
  var match = text.match(/^(\\d{4})-(\\d{2})-(\\d{2})/)
  if (!match) return text
  return match[1] + '年' + match[2] + '月' + match[3] + '日'
}`,
    },
  ],
}
const invoiceTaxRateDisplayFormat: DataFieldDisplayFormatConfig = {
  defaultCustomTemplateId: 'invoice-tax-rate',
  customTemplates: [
    {
      id: 'invoice-tax-rate',
      label: '税率百分比',
      hint: '把 0.13 这类税率转成 13%',
      source: `function transform(value, data) {
  var num = Number(value)
  if (isNaN(num)) return ''
  return Math.round(num * 10000) / 100 + '%'
}`,
    },
  ],
}
// ---------------------------------------------------------------------------
// A. 发票数据源
// Covers: scalar text/image, nested groups, collection for table-data binding
// ---------------------------------------------------------------------------
export const invoiceDataSource: DataSourceDescriptor = {
  id: 'invoice',
  name: 'invoice',
  title: '发票',
  expand: true,
  fields: [
    {
      name: 'company',
      title: '公司',
      path: 'company',
      expand: true,
      fields: [
        { name: 'name', title: '公司名称', path: 'company/name', use: 'text' },
        { name: 'logo', title: '公司Logo', path: 'company/logo', use: 'image' },
        { name: 'address', title: '地址', path: 'company/address', use: 'text' },
        { name: 'phone', title: '联系电话', path: 'company/phone', use: 'text' },
      ],
    },
    {
      name: 'invoice',
      title: '发票信息',
      path: 'invoice',
      expand: true,
      fields: [
        { name: 'number', title: '发票编号', path: 'invoice/number', use: 'text' },
        { name: 'date', title: '开票日期', path: 'invoice/date', use: 'text', displayFormat: invoiceDateDisplayFormat },
        { name: 'dueDate', title: '到期日', path: 'invoice/dueDate', use: 'text', displayFormat: invoiceDateDisplayFormat },
      ],
    },
    {
      name: 'customer',
      title: '客户',
      path: 'customer',
      expand: true,
      fields: [
        { name: 'name', title: '客户名称', path: 'customer/name', use: 'text' },
        { name: 'address', title: '客户地址', path: 'customer/address', use: 'text' },
      ],
    },
    {
      name: 'items',
      title: '明细项目',
      path: 'items',
      tag: 'collection',
      expand: true,
      fields: [
        { name: 'name', title: '品名', path: 'items/name', use: 'text' },
        { name: 'qty', title: '数量', path: 'items/qty', use: 'text' },
        { name: 'price', title: '单价', path: 'items/price', use: 'text', displayFormat: invoiceMoneyDisplayFormat },
        { name: 'amount', title: '金额', path: 'items/amount', use: 'text', displayFormat: invoiceMoneyDisplayFormat },
      ],
    },
    { name: 'subtotal', title: '小计', path: 'subtotal', use: 'text', displayFormat: invoiceMoneyDisplayFormat },
    { name: 'taxRate', title: '税率', path: 'taxRate', use: 'text', displayFormat: invoiceTaxRateDisplayFormat },
    { name: 'taxAmount', title: '税额', path: 'taxAmount', use: 'text', displayFormat: invoiceMoneyDisplayFormat },
    { name: 'grandTotal', title: '合计', path: 'grandTotal', use: 'text', displayFormat: invoiceMoneyDisplayFormat },
    { name: 'notes', title: '备注', path: 'notes', use: 'rich-text' },
  ],
}
// ---------------------------------------------------------------------------
// B. 商品数据源
// Covers: barcode, qrcode, image, union binding
// ---------------------------------------------------------------------------
export const productDataSource: DataSourceDescriptor = {
  id: 'product',
  name: 'product',
  title: '商品',
  fields: [
    { name: 'name', title: '商品名称', path: 'name', use: 'text' },
    {
      name: 'sku',
      title: 'SKU',
      path: 'sku',
      use: 'barcode',
      props: { format: 'CODE128', showText: true },
      union: [
        { name: 'skuLabel', path: 'sku', use: 'text', offsetX: 0, offsetY: 22 },
      ],
    },
    { name: 'qrUrl', title: '二维码链接', path: 'qrUrl', use: 'qrcode' },
    { name: 'photo', title: '商品图片', path: 'photo', use: 'image' },
    { name: 'price', title: '价格', path: 'price', use: 'text' },
    { name: 'category', title: '分类', path: 'category', use: 'text' },
    {
      name: 'specs',
      title: '规格参数',
      path: 'specs',
      expand: true,
      fields: [
        { name: 'weight', title: '重量', path: 'specs/weight', use: 'text' },
        { name: 'dimension', title: '尺寸', path: 'specs/dimension', use: 'text' },
        { name: 'color', title: '颜色', path: 'specs/color', use: 'text' },
        { name: 'material', title: '材质', path: 'specs/material', use: 'text' },
      ],
    },
  ],
}
// ---------------------------------------------------------------------------
// C. 订单列表数据源
// Covers: flat collection for table-data, multi-level nesting, headless
// ---------------------------------------------------------------------------
export const orderListDataSource: DataSourceDescriptor = {
  id: 'order-list',
  name: 'order-list',
  title: '订单列表',
  headless: true,
  fields: [
    {
      name: 'orders',
      title: '订单',
      path: 'orders',
      tag: 'collection',
      expand: true,
      fields: [
        { name: 'orderId', title: '订单编号', path: 'orders/orderId', use: 'text' },
        { name: 'customer', title: '客户', path: 'orders/customer', use: 'text' },
        { name: 'date', title: '下单日期', path: 'orders/date', use: 'text' },
        { name: 'status', title: '状态', path: 'orders/status', use: 'text' },
        { name: 'amount', title: '订单金额', path: 'orders/amount', use: 'text' },
        {
          name: 'items',
          title: '订单明细',
          path: 'orders/items',
          tag: 'collection',
          expand: true,
          fields: [
            { name: 'productName', title: '商品名称', path: 'orders/items/productName', use: 'text' },
            { name: 'qty', title: '数量', path: 'orders/items/qty', use: 'text' },
            { name: 'unitPrice', title: '单价', path: 'orders/items/unitPrice', use: 'text' },
          ],
        },
      ],
    },
    { name: 'totalOrders', title: '订单总数', path: 'totalOrders', use: 'text' },
    { name: 'totalRevenue', title: '总收入', path: 'totalRevenue', use: 'text' },
  ],
}
// ---------------------------------------------------------------------------
// All datasources
// ---------------------------------------------------------------------------
export const sampleDataSources: DataSourceDescriptor[] = [
  invoiceDataSource,
  productDataSource,
  orderListDataSource,
  certificateDataSource,
  badgeDataSource,
  salesReportDataSource,
  supermarketDataSource,
  verticalMixedTextDataSource,
]
// ---------------------------------------------------------------------------
// Invoice template with pre-bound text elements and table-data element
// ---------------------------------------------------------------------------
function createInvoiceTableNode(): MaterialNode {
  return {
    id: 'inv_items_table',
    type: 'table-data',
    modelVersion: 1,
    x: 10,
    y: 56,
    width: 190,
    height: 40,
    model: createSampleTableModel({
      namespace: 'invoice-items',
      kind: 'data',
      columnWeights: [0.4, 0.15, 0.2, 0.25],
      rows: [
        { role: 'header', minHeight: 8, style: { background: '#f5f5f5' }, cells: [{ text: '品名' }, { text: '数量' }, { text: '单价' }, { text: '金额' }] },
        { role: 'detail', minHeight: 8, cells: [{ bindingPort: 'items:name' }, { bindingPort: 'items:qty' }, { bindingPort: 'items:price' }, { bindingPort: 'items:amount' }] },
        { role: 'footer', minHeight: 8, style: { background: '#fafafa' }, cells: [{ text: '合计', colSpan: 3 }, {}, {}, { bindingPort: 'total:value' }] },
      ],
      collectionPort: 'records',
      style: {
        padding: { top: 0.53, right: 0.53, bottom: 0.53, left: 0.53 },
        border: {
          blockStart: { width: 0.13, style: 'solid', color: '#cccccc' },
          inlineEnd: { width: 0.13, style: 'solid', color: '#cccccc' },
          blockEnd: { width: 0.13, style: 'solid', color: '#cccccc' },
          inlineStart: { width: 0.13, style: 'solid', color: '#cccccc' },
        },
        typography: {
          fontSize: 3.18,
          color: '#000000',
          fontWeight: 'normal',
          fontStyle: 'normal',
          lineHeight: 1.2,
          letterSpacing: 0,
          textAlign: 'start',
          verticalAlign: 'middle',
        },
      },
    }) as unknown as Record<string, unknown>,
    slots: {},
    bindings: {
      'records': { sourceId: 'invoice', fieldPath: 'items', fieldLabel: '明细' },
      'items:name': { sourceId: 'invoice', fieldPath: 'items/name', fieldLabel: '品名' },
      'items:qty': { sourceId: 'invoice', fieldPath: 'items/qty', fieldLabel: '数量' },
      'items:price': { sourceId: 'invoice', fieldPath: 'items/price', fieldLabel: '单价' },
      'items:amount': { sourceId: 'invoice', fieldPath: 'items/amount', fieldLabel: '金额' },
      'total:value': { sourceId: 'invoice', fieldPath: 'grandTotal', fieldLabel: '合计' },
    },
    output: { visibility: 'include' },
  }
}
function createInvoiceElements(): DocumentSchema['elements'] {
  return [
    // 公司名称（绑定）
    {
      id: 'inv_company',
      type: 'text',
      modelVersion: 1,
      x: 10,
      y: 10,
      width: 100,
      height: 10,
      model: {
        content: '{#公司名称}',
        fontSize: 6.35,
        fontWeight: 'bold',
        color: '#333333',
        verticalAlign: 'middle',
        textAlign: 'left',
      },
      bindings: {
        value: {
          sourceId: 'invoice',
          fieldPath: 'company/name',
          fieldLabel: '公司名称',
        },
      },
      slots: {},
      output: { visibility: 'include' },
    },
    // 公司地址（绑定）
    {
      id: 'inv_address',
      type: 'text',
      modelVersion: 1,
      x: 10,
      y: 22,
      width: 100,
      height: 6,
      model: {
        content: '{#地址}',
        fontSize: 3.18,
        color: '#666666',
        verticalAlign: 'middle',
        textAlign: 'left',
      },
      bindings: {
        value: {
          sourceId: 'invoice',
          fieldPath: 'company/address',
          fieldLabel: '地址',
        },
      },
      slots: {},
      output: { visibility: 'include' },
    },
    // 发票标题
    {
      id: 'inv_title',
      type: 'text',
      modelVersion: 1,
      x: 140,
      y: 10,
      width: 60,
      height: 10,
      model: {
        content: '发票',
        fontSize: 7.76,
        fontWeight: 'bold',
        textAlign: 'right',
        color: '#1a1a1a',
        verticalAlign: 'middle',
      },
      slots: {},
      bindings: {},
      output: { visibility: 'include' },
    },
    // 发票编号（绑定）
    {
      id: 'inv_number',
      type: 'text',
      modelVersion: 1,
      x: 140,
      y: 22,
      width: 60,
      height: 6,
      model: {
        content: '{#发票编号}',
        fontSize: 3.18,
        textAlign: 'right',
        color: '#666666',
        verticalAlign: 'middle',
      },
      bindings: {
        value: {
          sourceId: 'invoice',
          fieldPath: 'invoice/number',
          fieldLabel: '发票编号',
        },
      },
      slots: {},
      output: { visibility: 'include' },
    },
    // 开票日期（绑定）
    {
      id: 'inv_date',
      type: 'text',
      modelVersion: 1,
      x: 140,
      y: 29,
      width: 60,
      height: 6,
      model: {
        content: '{#开票日期}',
        fontSize: 3.18,
        textAlign: 'right',
        color: '#666666',
        verticalAlign: 'middle',
      },
      bindings: {
        value: {
          sourceId: 'invoice',
          fieldPath: 'invoice/date',
          fieldLabel: '开票日期',
        },
      },
      slots: {},
      output: { visibility: 'include' },
    },
    // 分隔线
    {
      id: 'inv_line',
      type: 'line',
      modelVersion: 1,
      x: 10,
      y: 40,
      width: 190,
      height: 0.5,
      model: {
        lineColor: '#cccccc',
        lineType: 'solid',
      },
      slots: {},
      bindings: {},
      output: { visibility: 'include' },
    },
    // 客户信息（绑定）
    {
      id: 'inv_customer',
      type: 'text',
      modelVersion: 1,
      x: 10,
      y: 44,
      width: 100,
      height: 6,
      model: {
        content: '致：{#客户名称}',
        fontSize: 3.53,
        color: '#333333',
        verticalAlign: 'middle',
        textAlign: 'left',
      },
      bindings: {
        value: {
          sourceId: 'invoice',
          fieldPath: 'customer/name',
          fieldLabel: '客户名称',
        },
      },
      slots: {},
      output: { visibility: 'include' },
    },
    // 明细表格（table-data 绑定）
    createInvoiceTableNode(),
    // 合计（绑定）
    {
      id: 'inv_grand_total',
      type: 'text',
      modelVersion: 1,
      x: 140,
      y: 100,
      width: 60,
      height: 8,
      model: {
        content: '合计：{#合计}',
        fontSize: 4.94,
        fontWeight: 'bold',
        textAlign: 'right',
        color: '#1a1a1a',
        verticalAlign: 'middle',
      },
      bindings: {
        value: {
          sourceId: 'invoice',
          fieldPath: 'grandTotal',
          fieldLabel: '合计',
        },
      },
      slots: {},
      output: { visibility: 'include' },
    },
    // 备注（富文本绑定）
    {
      id: 'inv_notes',
      type: 'text',
      modelVersion: 1,
      x: 10,
      y: 110,
      width: 190,
      height: 12,
      model: {
        content: '{#备注}',
        fontSize: 3.18,
        color: '#999999',
        verticalAlign: 'middle',
        textAlign: 'left',
      },
      bindings: {
        value: {
          sourceId: 'invoice',
          fieldPath: 'notes',
          fieldLabel: '备注',
        },
      },
      slots: {},
      output: { visibility: 'include' },
    },
  ]
}
function createInvoiceTemplate(mode: DocumentSchema['page']['mode']): DocumentSchema {
  return {
    version: SCHEMA_VERSION,
    unit: 'mm',
    page: {
      mode,
      width: 210,
      height: 297,
    },
    guides: { x: [], y: [] },
    elements: createInvoiceElements(),
  }
}
export const invoiceWithTableTemplate: DocumentSchema = createInvoiceTemplate('fixed')
export const flowInvoiceTemplate: DocumentSchema = {
  ...createInvoiceTemplate('continuous'),
  page: {
    mode: 'continuous',
    width: 210,
    height: 297,
    layout: { strategy: 'stack-flow', flowAxis: 'y' },
    pagination: { strategy: 'none' },
    reflow: { strategy: 'flow-y', preserveTrailingGap: true, collisionPolicy: 'diagnose' },
  },
}
