import type { PageMode } from './types'

export type AIGenerationDomain
  = | 'supermarket-receipt'
    | 'restaurant-receipt'
    | 'shipping-label'
    | 'business-document'
    | 'certificate'
    | 'generic'

export interface AIPageAssumption {
  mode: PageMode
  width: number
  height: number
  unit: 'mm'
  reason: string
}

export interface AIGenerationPlan {
  domain: AIGenerationDomain
  confidence: 'high' | 'medium' | 'low'
  page: AIPageAssumption
  fieldNaming: 'english-camel-path-chinese-label'
  tableStrategy: 'table-data-for-arrays' | 'table-static-for-fixed' | 'avoid-table'
  sampleData: 'required'
  materialHints: string[]
  warnings: string[]
}

export interface AIMaterialDescriptor {
  type: string
  description: string
  properties: string[]
  requiredProps?: string[]
  binding?: 'none' | 'single' | 'multi'
  usage?: string[]
  schemaRules?: string[]
  examples?: Array<Record<string, unknown>>
}

interface DomainProfile {
  domain: AIGenerationDomain
  keywords: string[]
  page: AIPageAssumption
  tableStrategy: AIGenerationPlan['tableStrategy']
  materialHints: string[]
}

const DOMAIN_PROFILES: DomainProfile[] = [
  {
    domain: 'supermarket-receipt',
    keywords: ['商超', '超市', '便利店', '购物小票', '收银小票', '小票'],
    page: {
      mode: 'stack',
      width: 80,
      height: 200,
      unit: 'mm',
      reason: 'Retail receipts are usually generated on 80mm thermal paper and grow vertically with item rows.',
    },
    tableStrategy: 'table-data-for-arrays',
    materialHints: ['text', 'line', 'table-data', 'qrcode', 'barcode'],
  },
  {
    domain: 'restaurant-receipt',
    keywords: ['餐饮', '点餐', '外卖', '餐厅', '菜单', '桌号', '堂食'],
    page: {
      mode: 'stack',
      width: 80,
      height: 180,
      unit: 'mm',
      reason: 'Restaurant receipts are narrow thermal-paper documents with repeating order rows.',
    },
    tableStrategy: 'table-data-for-arrays',
    materialHints: ['text', 'line', 'table-data', 'qrcode'],
  },
  {
    domain: 'shipping-label',
    keywords: ['快递', '面单', '标签', '商品标签', '货架标签', '条码标签', '物流'],
    page: {
      mode: 'label',
      width: 80,
      height: 50,
      unit: 'mm',
      reason: 'Labels should use label mode and compact dimensions rather than A4 fixed pages.',
    },
    tableStrategy: 'avoid-table',
    materialHints: ['text', 'barcode', 'qrcode', 'line', 'rect', 'image'],
  },
  {
    domain: 'business-document',
    keywords: ['发票', '报价单', '订单', '出库单', '入库单', '对账单', '报表'],
    page: {
      mode: 'fixed',
      width: 210,
      height: 297,
      unit: 'mm',
      reason: 'Business documents are usually printed on A4 portrait pages.',
    },
    tableStrategy: 'table-data-for-arrays',
    materialHints: ['text', 'line', 'table-data', 'page-number'],
  },
  {
    domain: 'certificate',
    keywords: ['证书', '奖状', '授权书', '聘书'],
    page: {
      mode: 'fixed',
      width: 297,
      height: 210,
      unit: 'mm',
      reason: 'Certificates are commonly landscape fixed pages.',
    },
    tableStrategy: 'avoid-table',
    materialHints: ['text', 'rect', 'image', 'svg'],
  },
]

const GENERIC_PAGE: AIPageAssumption = {
  mode: 'fixed',
  width: 210,
  height: 297,
  unit: 'mm',
  reason: 'No domain-specific paper signal was detected, so A4 portrait is used.',
}

export function inferAIGenerationPlan(prompt: string): AIGenerationPlan {
  const text = prompt.trim().toLowerCase()
  const matches = DOMAIN_PROFILES
    .map(profile => ({
      profile,
      score: profile.keywords.reduce((count, keyword) => count + (text.includes(keyword.toLowerCase()) ? 1 : 0), 0),
    }))
    .filter(match => match.score > 0)
    .sort((a, b) => b.score - a.score)

  const best = matches[0]
  if (!best) {
    return {
      domain: 'generic',
      confidence: 'low',
      page: GENERIC_PAGE,
      fieldNaming: 'english-camel-path-chinese-label',
      tableStrategy: 'table-data-for-arrays',
      sampleData: 'required',
      materialHints: ['text', 'line', 'table-data'],
      warnings: ['No domain-specific paper profile matched the prompt.'],
    }
  }

  return {
    domain: best.profile.domain,
    confidence: best.score >= 2 ? 'high' : 'medium',
    page: best.profile.page,
    fieldNaming: 'english-camel-path-chinese-label',
    tableStrategy: best.profile.tableStrategy,
    sampleData: 'required',
    materialHints: best.profile.materialHints,
    warnings: matches.length > 1
      ? [`Multiple domain profiles matched; selected ${best.profile.domain}.`]
      : [],
  }
}
