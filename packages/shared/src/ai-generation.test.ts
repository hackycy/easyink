import { describe, expect, it } from 'vitest'
import { inferAIGenerationPlan } from './ai-generation'

describe('inferAIGenerationPlan', () => {
  it('infers supermarket receipts as 80mm stack documents', () => {
    const plan = inferAIGenerationPlan('请生成一个关于商超小票的模版')

    expect(plan.domain).toBe('supermarket-receipt')
    expect(plan.page).toMatchObject({ mode: 'stack', width: 80, height: 200 })
    expect(plan.tableStrategy).toBe('table-data-for-arrays')
    expect(plan.materialHints).toContain('table-data')
  })

  it('keeps business documents on A4 fixed pages', () => {
    const plan = inferAIGenerationPlan('生成一个报价单模板，包含商品明细')

    expect(plan.domain).toBe('business-document')
    expect(plan.page).toMatchObject({ mode: 'fixed', width: 210, height: 297 })
  })
})
