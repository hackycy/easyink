import type { DocumentSchema, MaterialNode } from '@easyink/schema'
import { SCHEMA_VERSION } from '@easyink/shared'

const TAX_RED = '#8b1e1e'
const BLACK = '#111111'

type TextAlign = 'left' | 'center' | 'right'
type VerticalAlign = 'top' | 'middle' | 'bottom'

interface TextOptions {
  fontSize?: number
  fontWeight?: string
  color?: string
  textAlign?: TextAlign
  verticalAlign?: VerticalAlign
  lineHeight?: number
  writingMode?: 'horizontal' | 'vertical'
}

function textNode(
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
  content: string,
  options: TextOptions = {},
): MaterialNode {
  return {
    id,
    type: 'text',
    x,
    y,
    width,
    height,
    props: {
      content,
      fontSize: options.fontSize ?? 4,
      fontWeight: options.fontWeight ?? 'normal',
      color: options.color ?? TAX_RED,
      textAlign: options.textAlign ?? 'center',
      verticalAlign: options.verticalAlign ?? 'middle',
      lineHeight: options.lineHeight ?? 1.35,
      writingMode: options.writingMode ?? 'horizontal',
      letterSpacing: 0,
      wrapMode: 'anywhere',
      overflow: 'hidden',
    },
  }
}

function rectNode(
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
  borderColor: string,
  borderWidth = 0.25,
): MaterialNode {
  return {
    id,
    type: 'rect',
    x,
    y,
    width,
    height,
    props: {
      fillColor: 'transparent',
      borderWidth,
      borderColor,
      borderType: 'solid',
      borderRadius: 0,
    },
  }
}

function ruleNode(
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
  color = TAX_RED,
): MaterialNode {
  return {
    id,
    type: 'rect',
    x,
    y,
    width,
    height,
    props: {
      fillColor: color,
      borderWidth: 0,
      borderColor: 'transparent',
      borderType: 'solid',
      borderRadius: 0,
    },
  }
}

const invoiceElements: MaterialNode[] = [
  rectNode('vat_outer_frame', 8, 8, 281, 194, BLACK, 0.3),

  rectNode('vat_qr_box', 17, 16, 27, 27, TAX_RED, 0.35),
  textNode('vat_qr_placeholder', 19, 24, 23, 12, '动态\n二维码', {
    fontSize: 4.1,
    lineHeight: 1.25,
  }),

  textNode('vat_title', 94, 19, 108, 12, '电子发票（普通发票）', {
    fontSize: 8.9,
    fontWeight: 'bold',
    color: TAX_RED,
  }),
  ruleNode('vat_title_rule_1', 100, 34.6, 97, 0.35),
  ruleNode('vat_title_rule_2', 100, 36.2, 97, 0.35),

  textNode('vat_number_label', 216, 21, 54, 7, '发票号码：', {
    fontSize: 4.2,
    textAlign: 'left',
  }),
  textNode('vat_date_label', 216, 34, 54, 7, '开票日期：', {
    fontSize: 4.2,
    textAlign: 'left',
  }),

  rectNode('vat_main_frame', 15, 50, 267, 130, TAX_RED, 0.3),

  ruleNode('vat_buyer_label_split', 23, 50, 0.3, 31),
  ruleNode('vat_party_split', 149, 50, 0.3, 31),
  ruleNode('vat_seller_label_split', 157, 50, 0.3, 31),
  ruleNode('vat_party_bottom', 15, 81, 267, 0.3),

  textNode('vat_buyer_label', 15.5, 53, 7, 24, '购买方信息', {
    fontSize: 4.1,
    writingMode: 'vertical',
  }),
  textNode('vat_buyer_fields', 25, 58, 116, 14, '名称：\n统一社会信用代码/纳税人识别号：', {
    fontSize: 4.2,
    lineHeight: 1.55,
    textAlign: 'left',
  }),
  textNode('vat_seller_label', 149.5, 53, 7, 24, '销售方信息', {
    fontSize: 4.1,
    writingMode: 'vertical',
  }),
  textNode('vat_seller_fields', 159, 58, 116, 14, '名称：\n统一社会信用代码/纳税人识别号：', {
    fontSize: 4.2,
    lineHeight: 1.55,
    textAlign: 'left',
  }),

  textNode('vat_item_name_header', 34, 82, 52, 9, '项目名称', { fontSize: 4.2 }),
  textNode('vat_spec_header', 91, 82, 32, 9, '规格型号', { fontSize: 4.2 }),
  textNode('vat_unit_header', 122, 82, 18, 9, '单位', { fontSize: 4.2 }),
  textNode('vat_qty_header', 142, 82, 23, 9, '数量', { fontSize: 4.2 }),
  textNode('vat_price_header', 168, 82, 25, 9, '单价', { fontSize: 4.2 }),
  textNode('vat_amount_header', 204, 82, 25, 9, '金额', { fontSize: 4.2 }),
  textNode('vat_tax_rate_header', 235, 82, 31, 9, '税率/征收率', { fontSize: 4.2 }),
  textNode('vat_tax_amount_header', 264, 82, 16, 9, '税额', { fontSize: 4.2 }),

  ruleNode('vat_items_bottom', 15, 143.5, 267, 0.3),
  textNode('vat_total_label', 35, 135.8, 38, 8, '合        计', { fontSize: 4.2 }),

  ruleNode('vat_total_amount_bottom', 15, 154.5, 267, 0.3),
  ruleNode('vat_total_amount_label_split', 84, 143.5, 0.3, 11),
  textNode('vat_amount_words_label', 34, 145.4, 48, 7, '价税合计(大写)', {
    fontSize: 4.1,
  }),
  textNode('vat_amount_number_label', 201, 145.4, 60, 7, '（小写）', {
    fontSize: 4.1,
  }),

  ruleNode('vat_remark_top', 15, 165.5, 267, 0.3),
  ruleNode('vat_remark_label_split', 23, 165.5, 0.3, 14.5),
  textNode('vat_remark_label', 15.5, 168, 7, 9.5, '备注', {
    fontSize: 4.1,
    writingMode: 'vertical',
  }),

  textNode('vat_issuer_label', 36, 187, 38, 7, '开票人：', {
    fontSize: 4.2,
    textAlign: 'left',
  }),
]

/**
 * 增值税电子普通发票空白模板。
 */
export const vatElectronicInvoiceTemplate: DocumentSchema = {
  version: SCHEMA_VERSION,
  unit: 'mm',
  meta: {
    name: '增值税电子普通发票',
    description: 'A4 横向增值税发票（电子/普通发票）空白版式。',
  },
  page: {
    mode: 'fixed',
    width: 297,
    height: 210,
    background: {
      color: '#ffffff',
    },
    print: {
      orientation: 'landscape',
    },
  },
  guides: { x: [], y: [] },
  elements: invoiceElements,
}
