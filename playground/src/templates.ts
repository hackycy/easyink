import type { DataSourceRegistration, TemplateSchema } from '@easyink/core'
import { SCHEMA_VERSION } from '@easyink/core'
import { sampleData, sampleDataSources } from './data'

let _counter = 0
function uid(): string {
  return `tpl-${Date.now().toString(36)}-${(++_counter).toString(36)}`
}

function pxToMm(value: number): number {
  return Number((value * 25.4 / 96).toFixed(3))
}

export interface PresetTemplate {
  name: string
  description: string
  schema: TemplateSchema
  data: Record<string, unknown>
  dataSources: Array<{ name: string } & DataSourceRegistration>
}

// ─── 空白模板 ───

const blankTemplate: PresetTemplate = {
  name: '空白模板',
  description: 'A4 空白模板，从零开始设计',
  schema: {
    version: SCHEMA_VERSION,
    meta: { name: '空白模板' },
    page: {
      paper: 'A4',
      orientation: 'portrait',
      margins: { top: 10, right: 10, bottom: 10, left: 10 },
      unit: 'mm',
    },
    elements: [],
  },
  data: sampleData,
  dataSources: sampleDataSources,
}

// ─── 热敏小票模板 ───

function createReceiptTemplate(): PresetTemplate {
  // 内容区宽度: 80 - 3 - 3 = 74mm
  const contentWidth = 74

  const schema: TemplateSchema = {
    version: SCHEMA_VERSION,
    meta: { name: '热敏小票' },
    page: {
      paper: { type: 'custom', width: 80, height: 200 },
      orientation: 'portrait',
      margins: { top: 3, right: 3, bottom: 3, left: 3 },
      unit: 'mm',
      overflow: 'auto-extend',
    },
    elements: [
      // 店名
      {
        id: uid(),
        type: 'text',
        name: '店名',
        layout: { position: 'flow', width: 'auto', height: 10 },
        props: { content: 'ACME 科技有限公司', verticalAlign: 'middle', wordBreak: 'normal', overflow: 'visible' },
        style: { fontSize: pxToMm(18), fontWeight: 'bold', textAlign: 'center', color: '#000000' },
        binding: { path: 'companyName' },
      },
      // 分隔线 1
      {
        id: uid(),
        type: 'line',
        name: '分隔线',
        layout: { position: 'flow', width: contentWidth, height: 0 },
        props: { direction: 'horizontal', strokeWidth: pxToMm(1), strokeColor: '#000000', strokeStyle: 'dashed' },
        style: {},
      },
      // 订单号
      {
        id: uid(),
        type: 'text',
        name: '订单号',
        layout: { position: 'flow', width: 'auto', height: 6 },
        props: { content: '订单号：', verticalAlign: 'middle', wordBreak: 'normal', overflow: 'visible' },
        style: { fontSize: pxToMm(10), color: '#000000' },
        binding: { path: 'orderNo' },
      },
      // 日期
      {
        id: uid(),
        type: 'text',
        name: '下单日期',
        layout: { position: 'flow', width: 'auto', height: 6 },
        props: { content: '日期：', verticalAlign: 'middle', wordBreak: 'normal', overflow: 'visible' },
        style: { fontSize: pxToMm(10), color: '#000000' },
        binding: { path: 'orderDate' },
      },
      // 分隔线 2
      {
        id: uid(),
        type: 'line',
        name: '分隔线',
        layout: { position: 'flow', width: contentWidth, height: 0 },
        props: { direction: 'horizontal', strokeWidth: pxToMm(1), strokeColor: '#000000', strokeStyle: 'dashed' },
        style: {},
      },
      // 商品明细表格
      {
        id: uid(),
        type: 'table',
        name: '商品明细',
        layout: { position: 'flow', width: 'auto', height: 'auto' },
        props: {
          columns: [
            { key: 'name', title: '商品', width: 40, align: 'left', binding: { path: 'orderItems.itemName' } },
            { key: 'qty', title: '数量', width: 15, align: 'center', binding: { path: 'orderItems.itemQty' } },
            { key: 'price', title: '单价', width: 20, align: 'right', binding: { path: 'orderItems.itemPrice' } },
            { key: 'amount', title: '金额', width: 25, align: 'right', binding: { path: 'orderItems.itemAmount' } },
          ],
          bordered: true,
          striped: false,
          rowHeight: 'auto',
          emptyBehavior: 'placeholder',
          minRows: 1,
          emptyText: '暂无数据',
        },
        style: { fontSize: pxToMm(10) },
      },
      // 分隔线 3
      {
        id: uid(),
        type: 'line',
        name: '分隔线',
        layout: { position: 'flow', width: contentWidth, height: 0 },
        props: { direction: 'horizontal', strokeWidth: pxToMm(1), strokeColor: '#000000', strokeStyle: 'solid' },
        style: {},
      },
      // 合计
      {
        id: uid(),
        type: 'text',
        name: '合计',
        layout: { position: 'flow', width: 'auto', height: 8 },
        props: { content: '合计：¥580', verticalAlign: 'middle', wordBreak: 'normal', overflow: 'visible' },
        style: { fontSize: pxToMm(14), fontWeight: 'bold', textAlign: 'right', color: '#000000' },
        binding: { path: 'orderTotal' },
      },
      // 分隔线 4
      {
        id: uid(),
        type: 'line',
        name: '分隔线',
        layout: { position: 'flow', width: contentWidth, height: 0 },
        props: { direction: 'horizontal', strokeWidth: pxToMm(1), strokeColor: '#000000', strokeStyle: 'dashed' },
        style: {},
      },
      // 谢谢惠顾
      {
        id: uid(),
        type: 'text',
        name: '底部感谢',
        layout: { position: 'flow', width: 'auto', height: 8 },
        props: { content: '谢谢惠顾，欢迎下次光临！', verticalAlign: 'middle', wordBreak: 'normal', overflow: 'visible' },
        style: { fontSize: pxToMm(10), textAlign: 'center', color: '#666666' },
      },
    ],
  }

  return {
    name: '热敏小票',
    description: '80mm 热敏纸小票模板（auto-extend）',
    schema,
    data: sampleData,
    dataSources: sampleDataSources,
  }
}

// ─── 商品标签模板 ───

const labelDataSources: Array<{ name: string } & DataSourceRegistration> = [
  {
    name: '商品信息',
    displayName: '商品信息',
    fields: [
      { key: 'productName', title: '商品名称' },
      { key: 'productPrice', title: '商品价格' },
      { key: 'productCode', title: '商品条码' },
      { key: 'productSpec', title: '商品规格' },
    ],
  },
]

const labelData: Record<string, unknown> = {
  productName: '无线蓝牙耳机 Pro Max',
  productPrice: '¥ 299.00',
  productCode: '6901234567890',
  productSpec: '黑色 / 标准版',
}

function createLabelTemplate(): PresetTemplate {
  const schema: TemplateSchema = {
    version: SCHEMA_VERSION,
    meta: { name: '商品标签' },
    page: {
      paper: { type: 'label', width: 60, height: 40 },
      orientation: 'portrait',
      margins: { top: 2, right: 2, bottom: 2, left: 2 },
      unit: 'mm',
      overflow: 'clip',
    },
    elements: [
      // 商品名
      {
        id: uid(),
        type: 'text',
        name: '商品名称',
        layout: { position: 'absolute', x: 0, y: 0, width: 56, height: 8 },
        props: { content: '无线蓝牙耳机 Pro Max', verticalAlign: 'middle', wordBreak: 'break-word', overflow: 'hidden' },
        style: { fontSize: pxToMm(12), fontWeight: 'bold', color: '#000000' },
        binding: { path: 'productName' },
      },
      // 规格
      {
        id: uid(),
        type: 'text',
        name: '商品规格',
        layout: { position: 'absolute', x: 0, y: 8, width: 56, height: 5 },
        props: { content: '黑色 / 标准版', verticalAlign: 'middle', wordBreak: 'normal', overflow: 'hidden' },
        style: { fontSize: pxToMm(8), color: '#666666' },
        binding: { path: 'productSpec' },
      },
      // 价格
      {
        id: uid(),
        type: 'text',
        name: '价格',
        layout: { position: 'absolute', x: 0, y: 14, width: 56, height: 10 },
        props: { content: '¥ 299.00', verticalAlign: 'middle', wordBreak: 'normal', overflow: 'visible' },
        style: { fontSize: pxToMm(20), fontWeight: 'bold', color: '#e00000' },
        binding: { path: 'productPrice' },
      },
      // 分隔线
      {
        id: uid(),
        type: 'line',
        name: '分隔线',
        layout: { position: 'absolute', x: 0, y: 24, width: 56, height: 0 },
        props: { direction: 'horizontal', strokeWidth: pxToMm(0.5), strokeColor: '#cccccc', strokeStyle: 'solid' },
        style: {},
      },
      // 条形码
      {
        id: uid(),
        type: 'barcode',
        name: '商品条码',
        layout: { position: 'absolute', x: 3, y: 25, width: 50, height: 11 },
        props: { format: 'CODE128', value: '6901234567890', displayValue: true, barWidth: 1, errorCorrectionLevel: 'M' },
        style: {},
        binding: { path: 'productCode' },
      },
    ],
  }

  return {
    name: '商品标签',
    description: '60×40mm 商品价签（clip 模式）',
    schema,
    data: labelData,
    dataSources: labelDataSources,
  }
}

// ─── 送货单模板 ───

function createDeliveryNoteTemplate(): PresetTemplate {
  // 内容区宽度: 210 - 15 - 15 = 180mm
  const contentWidth = 180

  const schema: TemplateSchema = {
    version: SCHEMA_VERSION,
    meta: { name: '送货单' },
    page: {
      paper: 'A4',
      orientation: 'portrait',
      margins: { top: 15, right: 15, bottom: 15, left: 15 },
      unit: 'mm',
      overflow: 'clip',
    },
    elements: [
      // 公司名称
      {
        id: uid(),
        type: 'text',
        name: '公司名称',
        layout: { position: 'flow', width: 'auto', height: 12 },
        props: { content: 'ACME 科技有限公司', verticalAlign: 'middle', wordBreak: 'normal', overflow: 'visible' },
        style: { fontSize: pxToMm(22), fontWeight: 'bold', textAlign: 'center', color: '#000000' },
        binding: { path: 'companyName' },
      },
      // 公司地址
      {
        id: uid(),
        type: 'text',
        name: '公司地址',
        layout: { position: 'flow', width: 'auto', height: 6 },
        props: { content: '上海市浦东新区陆家嘴环路999号', verticalAlign: 'middle', wordBreak: 'normal', overflow: 'visible' },
        style: { fontSize: pxToMm(9), textAlign: 'center', color: '#666666' },
        binding: { path: 'companyAddress' },
      },
      // 公司电话
      {
        id: uid(),
        type: 'text',
        name: '公司电话',
        layout: { position: 'flow', width: 'auto', height: 6 },
        props: { content: '021-12345678', verticalAlign: 'middle', wordBreak: 'normal', overflow: 'visible' },
        style: { fontSize: pxToMm(9), textAlign: 'center', color: '#666666' },
        binding: { path: 'companyPhone' },
      },
      // 分隔线
      {
        id: uid(),
        type: 'line',
        name: '分隔线',
        layout: { position: 'flow', width: contentWidth, height: 0 },
        props: { direction: 'horizontal', strokeWidth: pxToMm(2), strokeColor: '#000000', strokeStyle: 'solid' },
        style: {},
      },
      // 标题
      {
        id: uid(),
        type: 'text',
        name: '标题',
        layout: { position: 'flow', width: 'auto', height: 12 },
        props: { content: '送 货 单', verticalAlign: 'middle', wordBreak: 'normal', overflow: 'visible' },
        style: { fontSize: pxToMm(20), fontWeight: 'bold', textAlign: 'center', color: '#000000' },
      },
      // 订单号
      {
        id: uid(),
        type: 'text',
        name: '订单号',
        layout: { position: 'flow', width: 'auto', height: 7 },
        props: { content: '订单号：', verticalAlign: 'middle', wordBreak: 'normal', overflow: 'visible' },
        style: { fontSize: pxToMm(11), color: '#000000' },
        binding: { path: 'orderNo' },
      },
      // 日期
      {
        id: uid(),
        type: 'text',
        name: '日期',
        layout: { position: 'flow', width: 'auto', height: 7 },
        props: { content: '日期：', verticalAlign: 'middle', wordBreak: 'normal', overflow: 'visible' },
        style: { fontSize: pxToMm(11), color: '#000000' },
        binding: { path: 'orderDate' },
      },
      // 客户名称
      {
        id: uid(),
        type: 'text',
        name: '客户名称',
        layout: { position: 'flow', width: 'auto', height: 7 },
        props: { content: '客户：', verticalAlign: 'middle', wordBreak: 'normal', overflow: 'visible' },
        style: { fontSize: pxToMm(11), color: '#000000' },
        binding: { path: 'customerName' },
      },
      // 客户电话
      {
        id: uid(),
        type: 'text',
        name: '联系电话',
        layout: { position: 'flow', width: 'auto', height: 7 },
        props: { content: '电话：', verticalAlign: 'middle', wordBreak: 'normal', overflow: 'visible' },
        style: { fontSize: pxToMm(11), color: '#000000' },
        binding: { path: 'customerPhone' },
      },
      // 客户地址
      {
        id: uid(),
        type: 'text',
        name: '客户地址',
        layout: { position: 'flow', width: 'auto', height: 7 },
        props: { content: '地址：', verticalAlign: 'middle', wordBreak: 'normal', overflow: 'visible' },
        style: { fontSize: pxToMm(11), color: '#000000' },
        binding: { path: 'customerAddress' },
      },
      // 商品明细表格
      {
        id: uid(),
        type: 'table',
        name: '商品明细',
        layout: { position: 'flow', width: 'auto', height: 'auto' },
        props: {
          columns: [
            { key: 'name', title: '商品名称', width: 40, align: 'left', binding: { path: 'orderItems.itemName' } },
            { key: 'qty', title: '数量', width: 15, align: 'center', binding: { path: 'orderItems.itemQty' } },
            { key: 'price', title: '单价（元）', width: 20, align: 'right', binding: { path: 'orderItems.itemPrice' } },
            { key: 'amount', title: '金额（元）', width: 25, align: 'right', binding: { path: 'orderItems.itemAmount' } },
          ],
          bordered: true,
          striped: true,
          rowHeight: 'auto',
          emptyBehavior: 'placeholder',
          minRows: 1,
          emptyText: '暂无数据',
        },
        style: { fontSize: pxToMm(11) },
      },
      // 合计
      {
        id: uid(),
        type: 'text',
        name: '合计金额',
        layout: { position: 'flow', width: 'auto', height: 8 },
        props: { content: '合计金额：¥580', verticalAlign: 'middle', wordBreak: 'normal', overflow: 'visible' },
        style: { fontSize: pxToMm(13), fontWeight: 'bold', textAlign: 'right', color: '#000000' },
        binding: { path: 'orderTotal' },
      },
      // 分隔线
      {
        id: uid(),
        type: 'line',
        name: '分隔线',
        layout: { position: 'flow', width: contentWidth, height: 0 },
        props: { direction: 'horizontal', strokeWidth: pxToMm(1), strokeColor: '#cccccc', strokeStyle: 'solid' },
        style: {},
      },
      // 签收人
      {
        id: uid(),
        type: 'text',
        name: '签收人',
        layout: { position: 'absolute', x: 0, y: 230, width: 80, height: 8 },
        props: { content: '签收人：__________', verticalAlign: 'middle', wordBreak: 'normal', overflow: 'visible' },
        style: { fontSize: pxToMm(11), color: '#000000' },
      },
      // 签收日期
      {
        id: uid(),
        type: 'text',
        name: '签收日期',
        layout: { position: 'absolute', x: 100, y: 230, width: 80, height: 8 },
        props: { content: '日期：__________', verticalAlign: 'middle', wordBreak: 'normal', overflow: 'visible' },
        style: { fontSize: pxToMm(11), color: '#000000' },
      },
    ],
  }

  return {
    name: '送货单',
    description: 'A4 送货单模板，含公司信息/客户信息/商品明细表',
    schema,
    data: sampleData,
    dataSources: sampleDataSources,
  }
}

// ─── 导出所有预置模板 ───

export const presetTemplates: PresetTemplate[] = [
  blankTemplate,
  createReceiptTemplate(),
  createLabelTemplate(),
  createDeliveryNoteTemplate(),
]
