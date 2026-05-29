import { describe, expect, it } from 'vitest'
import { coerceLLMPlan, getDomainProfile, inferAIGenerationPlan, registerDomainProfile } from './domain-profile'

describe('inferAIGenerationPlan', () => {
  it('infers supermarket receipts as 80mm continuous paper documents', () => {
    const plan = inferAIGenerationPlan('请生成一个关于商超小票的模版')

    expect(plan.domain).toBe('supermarket-receipt')
    expect(plan.page).toMatchObject({ mode: 'continuous', width: 80, height: 200 })
    expect(plan.tableStrategy).toBe('table-data-for-arrays')
    expect(plan.materialHints).toContain('table-data')
  })

  it('keeps business documents on A4 fixed pages', () => {
    const plan = inferAIGenerationPlan('生成一个报价单模板，包含商品明细')

    expect(plan.domain).toBe('business-document')
    expect(plan.page).toMatchObject({ mode: 'fixed', width: 210, height: 297 })
  })
})

describe('coerceLLMPlan', () => {
  it('clamps unsafe paper sizes to allowed range', () => {
    const plan = coerceLLMPlan({
      domain: 'supermarket-receipt',
      page: { mode: 'continuous', width: 5, height: 10000 },
      tableStrategy: 'table-data-for-arrays',
    }, '小票')

    expect(plan.page.width).toBe(20)
    expect(plan.page.height).toBe(1800)
  })

  it('falls back to keyword inference when LLM proposes unknown domain', () => {
    const plan = coerceLLMPlan({
      domain: 'unknown-thing',
      page: { mode: 'fixed', width: 210, height: 297 },
      tableStrategy: 'avoid-table',
    }, '生成一个商超小票模板')

    expect(plan.domain).toBe('unknown-thing')
    expect(plan.warnings.length).toBeGreaterThan(0)
    // page is preserved (still in range)
    expect(plan.page.mode).toBe('fixed')
  })

  it('rejects unknown table strategies', () => {
    const plan = coerceLLMPlan({
      domain: 'supermarket-receipt',
      page: { mode: 'continuous', width: 80, height: 200 },
      tableStrategy: 'invalid-strategy',
    }, '小票')

    expect(plan.tableStrategy).toBe('table-data-for-arrays')
  })
})

describe('registerDomainProfile', () => {
  it('lets external code introduce new domains', () => {
    registerDomainProfile({
      domain: 'test-domain',
      label: 'Test',
      keywords: ['test-uniquekey'],
      page: { mode: 'fixed', width: 100, height: 150, unit: 'mm', reason: 'test' },
      tableStrategy: 'avoid-table',
      materialHints: ['text'],
      dataSourceName: 'test',
    })

    const plan = inferAIGenerationPlan('contains test-uniquekey here')
    expect(plan.domain).toBe('test-domain')
    expect(getDomainProfile('test-domain').label).toBe('Test')
  })
})
