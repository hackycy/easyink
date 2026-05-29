import { describe, expect, it } from 'vitest'
import { inferAIGenerationPlan, listDomainProfiles } from './index'

describe('assistant presets', () => {
  it('exposes deterministic EasyInk domain profiles', () => {
    expect(listDomainProfiles().some(profile => profile.domain === 'supermarket-receipt')).toBe(true)
    expect(inferAIGenerationPlan('商超小票').domain).toBe('supermarket-receipt')
  })
})
