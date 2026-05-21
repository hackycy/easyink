import type { AIGenerationPlan, AIPageAssumption, DomainFieldHint } from '@easyink/shared'
import { isObject } from '@easyink/shared'

/**
 * Field shape used by domain profiles to declare required and suggested
 * fields. Compatible with `TemplateIntentField` so profiles and intents
 * can be merged without conversion.
 */
export interface DomainFieldSpec {
  name: string
  path?: string
  title?: string
  fieldLabel?: string
  type?: 'string' | 'number' | 'boolean' | 'array' | 'object'
  required?: boolean
  children?: DomainFieldSpec[]
}

/**
 * Self-contained description of a template domain. New domains are added by
 * registering a `DomainProfile` instead of hard-coding fields, sections, and
 * paper assumptions in multiple files.
 */
export interface DomainProfile {
  domain: string
  /** Chinese label shown by the AI panel and used to title generated pages. */
  label: string
  /** Keyword fragments (lower-case) used by `inferAIGenerationPlan`. */
  keywords: string[]
  page: AIPageAssumption
  tableStrategy: AIGenerationPlan['tableStrategy']
  materialHints: string[]
  /** Default data source name used when the intent omits one. */
  dataSourceName: string
  /**
   * Fields the domain considers structurally required. When an LLM omits any
   * of these, the generation pipeline injects them and triggers a single
   * retry so that the model has the chance to fill remaining details.
   */
  requiredFields?: DomainFieldSpec[]
  /**
   * Fields suggested for the domain. Used only when the LLM produced no
   * fields at all, so trusted LLM output is never overwritten.
   */
  suggestedFields?: DomainFieldSpec[]
}

const BUILTIN_PROFILES: DomainProfile[] = [
  {
    domain: 'supermarket-receipt',
    label: '商超/便利店小票',
    keywords: ['商超', '超市', '便利店', '购物小票', '收银小票', '小票'],
    page: {
      mode: 'continuous',
      width: 80,
      height: 200,
      unit: 'mm',
      reason: 'Retail receipts are usually generated on 80mm thermal paper and grow vertically with item rows.',
    },
    tableStrategy: 'table-data-for-arrays',
    materialHints: ['text', 'line', 'table-data', 'qrcode', 'barcode'],
    dataSourceName: 'receipt',
    requiredFields: [
      {
        name: 'items',
        title: '商品明细',
        type: 'array',
        path: 'items',
        required: true,
        children: [
          { name: 'name', title: '商品', type: 'string', path: 'items/name', required: true },
          { name: 'quantity', title: '数量', type: 'number', path: 'items/quantity', required: true },
          { name: 'unitPrice', title: '单价', type: 'number', path: 'items/unitPrice', required: true },
          { name: 'subtotal', title: '小计', type: 'number', path: 'items/subtotal', required: true },
        ],
      },
      { name: 'total', title: '应付合计', type: 'number', path: 'total', required: true },
    ],
    suggestedFields: [
      {
        name: 'store',
        title: '门店',
        type: 'object',
        path: 'store',
        children: [
          { name: 'name', title: '店铺名称', type: 'string', path: 'store/name' },
          { name: 'address', title: '门店地址', type: 'string', path: 'store/address' },
          { name: 'phone', title: '联系电话', type: 'string', path: 'store/phone' },
        ],
      },
      { name: 'receiptNo', title: '小票号', type: 'string', path: 'receiptNo' },
      { name: 'datetime', title: '交易时间', type: 'string', path: 'datetime' },
      { name: 'cashier', title: '收银员', type: 'string', path: 'cashier' },
      { name: 'subtotal', title: '商品合计', type: 'number', path: 'subtotal' },
      { name: 'discount', title: '优惠金额', type: 'number', path: 'discount' },
      { name: 'paymentMethod', title: '支付方式', type: 'string', path: 'paymentMethod' },
      { name: 'paidAmount', title: '实收金额', type: 'number', path: 'paidAmount' },
      { name: 'change', title: '找零', type: 'number', path: 'change' },
    ],
  },
  {
    domain: 'restaurant-receipt',
    label: '餐饮小票',
    keywords: ['餐饮', '点餐', '外卖', '餐厅', '菜单', '桌号', '堂食'],
    page: {
      mode: 'continuous',
      width: 80,
      height: 180,
      unit: 'mm',
      reason: 'Restaurant receipts are narrow thermal-paper documents with repeating order rows.',
    },
    tableStrategy: 'table-data-for-arrays',
    materialHints: ['text', 'line', 'table-data', 'qrcode'],
    dataSourceName: 'receipt',
    requiredFields: [
      {
        name: 'items',
        title: '菜品明细',
        type: 'array',
        path: 'items',
        required: true,
        children: [
          { name: 'name', title: '菜品', type: 'string', path: 'items/name', required: true },
          { name: 'quantity', title: '数量', type: 'number', path: 'items/quantity', required: true },
          { name: 'unitPrice', title: '单价', type: 'number', path: 'items/unitPrice', required: true },
          { name: 'subtotal', title: '小计', type: 'number', path: 'items/subtotal', required: true },
        ],
      },
      { name: 'total', title: '应付合计', type: 'number', path: 'total', required: true },
    ],
    suggestedFields: [
      { name: 'tableNo', title: '桌号', type: 'string', path: 'tableNo' },
      { name: 'orderNo', title: '订单号', type: 'string', path: 'orderNo' },
      { name: 'datetime', title: '下单时间', type: 'string', path: 'datetime' },
      { name: 'guests', title: '人数', type: 'number', path: 'guests' },
      { name: 'paymentMethod', title: '支付方式', type: 'string', path: 'paymentMethod' },
    ],
  },
  {
    domain: 'shipping-label',
    label: '快递/商品标签',
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
    dataSourceName: 'label',
    requiredFields: [
      { name: 'title', title: '标题', type: 'string', path: 'title', required: true },
      { name: 'code', title: '条码', type: 'string', path: 'code', required: true },
    ],
  },
  {
    domain: 'business-document',
    label: '发票/报价单/订单',
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
    dataSourceName: 'document',
    requiredFields: [
      {
        name: 'items',
        title: '明细',
        type: 'array',
        path: 'items',
        required: true,
        children: [
          { name: 'name', title: '名称', type: 'string', path: 'items/name', required: true },
          { name: 'quantity', title: '数量', type: 'number', path: 'items/quantity', required: true },
          { name: 'amount', title: '金额', type: 'number', path: 'items/amount', required: true },
        ],
      },
      { name: 'total', title: '合计', type: 'number', path: 'total', required: true },
    ],
  },
  {
    domain: 'certificate',
    label: '证书/奖状',
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
    dataSourceName: 'certificate',
    requiredFields: [
      { name: 'recipient', title: '获奖人', type: 'string', path: 'recipient', required: true },
      { name: 'title', title: '荣誉', type: 'string', path: 'title', required: true },
    ],
  },
]

const GENERIC_PROFILE: DomainProfile = {
  domain: 'generic',
  label: '通用文档',
  keywords: [],
  page: {
    mode: 'fixed',
    width: 210,
    height: 297,
    unit: 'mm',
    reason: 'No domain-specific paper signal was detected, so A4 portrait is used.',
  },
  tableStrategy: 'table-data-for-arrays',
  materialHints: ['text', 'line', 'table-data'],
  dataSourceName: 'templateData',
  suggestedFields: [
    { name: 'title', title: '标题', type: 'string', path: 'title' },
    {
      name: 'items',
      title: '明细',
      type: 'array',
      path: 'items',
      children: [
        { name: 'name', title: '名称', type: 'string', path: 'items/name' },
        { name: 'quantity', title: '数量', type: 'number', path: 'items/quantity' },
        { name: 'amount', title: '金额', type: 'number', path: 'items/amount' },
      ],
    },
    { name: 'total', title: '合计', type: 'number', path: 'total' },
  ],
}

const registry = new Map<string, DomainProfile>()
for (const profile of BUILTIN_PROFILES)
  registry.set(profile.domain, profile)
registry.set(GENERIC_PROFILE.domain, GENERIC_PROFILE)

/**
 * Register or replace a domain profile. Used by mcp-server boot code to
 * extend the AI generation pipeline without modifying schema-tools.
 */
export function registerDomainProfile(profile: DomainProfile): void {
  registry.set(profile.domain, profile)
}

export function getDomainProfile(domain: string | undefined): DomainProfile {
  if (!domain)
    return GENERIC_PROFILE
  return registry.get(domain) ?? GENERIC_PROFILE
}

export function listDomainProfiles(): DomainProfile[] {
  return [...registry.values()]
}

/**
 * Keyword-based plan inference. Used as the cheap fallback when an LLM-
 * derived plan is unavailable or fails validation.
 */
export function inferAIGenerationPlan(prompt: string): AIGenerationPlan {
  const text = prompt.trim().toLowerCase()
  const matches = listDomainProfiles()
    .filter(profile => profile.domain !== 'generic')
    .map(profile => ({
      profile,
      score: profile.keywords.reduce((count, keyword) => count + (text.includes(keyword.toLowerCase()) ? 1 : 0), 0),
    }))
    .filter(match => match.score > 0)
    .sort((a, b) => b.score - a.score)

  const best = matches[0]
  if (!best)
    return planFromProfile(GENERIC_PROFILE, 'low', ['No domain-specific paper profile matched the prompt.'])

  return planFromProfile(
    best.profile,
    best.score >= 2 ? 'high' : 'medium',
    matches.length > 1 ? [`Multiple domain profiles matched; selected ${best.profile.domain}.`] : [],
  )
}

function planFromProfile(profile: DomainProfile, confidence: AIGenerationPlan['confidence'], warnings: string[]): AIGenerationPlan {
  return {
    domain: profile.domain,
    confidence,
    page: profile.page,
    fieldNaming: 'english-camel-path-chinese-label',
    tableStrategy: profile.tableStrategy,
    sampleData: 'required',
    materialHints: profile.materialHints,
    warnings,
    requiredFieldHints: projectRequiredFieldHints(profile.requiredFields),
  }
}

/**
 * Project the profile's required-field tree into the lighter `DomainFieldHint`
 * shape that travels on the plan. We only carry the hints (name/path/type/
 * required/title) so the prompt stays compact and decoupled from the
 * `DomainFieldSpec` that drives the deterministic builder.
 */
function projectRequiredFieldHints(specs: DomainFieldSpec[] | undefined): DomainFieldHint[] | undefined {
  if (!specs || specs.length === 0)
    return undefined
  return specs.map(spec => projectFieldHint(spec))
}

function projectFieldHint(spec: DomainFieldSpec): DomainFieldHint {
  return {
    name: spec.name,
    path: spec.path ?? spec.name,
    type: spec.type ?? 'string',
    required: spec.required ?? true,
    title: spec.title ?? spec.fieldLabel,
    children: spec.children?.length ? spec.children.map(child => projectFieldHint(child)) : undefined,
  }
}

const PAGE_MODES = new Set(['fixed', 'label', 'continuous'])
const TABLE_STRATEGIES = new Set<AIGenerationPlan['tableStrategy']>([
  'table-data-for-arrays',
  'table-static-for-fixed',
  'avoid-table',
])
const PAGE_WIDTH_RANGE: [number, number] = [20, 1200]
const PAGE_HEIGHT_RANGE: [number, number] = [20, 1800]

/**
 * Coerce an unvalidated LLM-produced plan into an `AIGenerationPlan`. The
 * caller's domain registration determines which domains are allowed; any
 * unknown domain falls back to the keyword inference.
 */
export function coerceLLMPlan(raw: unknown, prompt: string): AIGenerationPlan {
  if (!isObject(raw))
    return inferAIGenerationPlan(prompt)

  const fallback = inferAIGenerationPlan(prompt)
  const domain = typeof raw.domain === 'string' ? raw.domain : fallback.domain
  const profile = registry.get(domain)
  const tableStrategy = isTableStrategy(raw.tableStrategy)
    ? raw.tableStrategy
    : profile?.tableStrategy ?? fallback.tableStrategy
  const page = clampPage(raw.page, profile, fallback)
  const confidence = isConfidence(raw.confidence) ? raw.confidence : (profile ? 'high' : 'medium')

  return {
    domain,
    confidence,
    page,
    fieldNaming: 'english-camel-path-chinese-label',
    tableStrategy,
    sampleData: 'required',
    materialHints: profile?.materialHints ?? fallback.materialHints,
    warnings: profile ? [] : [`Unknown LLM-proposed domain "${domain}", using inferred profile.`],
    requiredFieldHints: profile
      ? projectRequiredFieldHints(profile.requiredFields)
      : fallback.requiredFieldHints,
  }
}

function clampPage(
  raw: unknown,
  profile: DomainProfile | undefined,
  fallback: AIGenerationPlan,
): AIPageAssumption {
  const defaults = profile?.page ?? fallback.page
  if (!isObject(raw))
    return defaults

  const mode = typeof raw.mode === 'string' && PAGE_MODES.has(raw.mode)
    ? raw.mode as AIPageAssumption['mode']
    : defaults.mode
  const width = clampNumber(raw.width, PAGE_WIDTH_RANGE, defaults.width)
  const height = clampNumber(raw.height, PAGE_HEIGHT_RANGE, defaults.height)
  const reason = typeof raw.reason === 'string' && raw.reason ? raw.reason : defaults.reason

  return { mode, width, height, unit: 'mm', reason }
}

function clampNumber(value: unknown, [min, max]: [number, number], fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value))
    return fallback
  return Math.min(max, Math.max(min, value))
}

function isTableStrategy(value: unknown): value is AIGenerationPlan['tableStrategy'] {
  return typeof value === 'string' && TABLE_STRATEGIES.has(value as AIGenerationPlan['tableStrategy'])
}

function isConfidence(value: unknown): value is AIGenerationPlan['confidence'] {
  return value === 'high' || value === 'medium' || value === 'low'
}
