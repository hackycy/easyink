import { describe, expect, it } from 'vitest'
import { StaticLLMClient } from './index'

describe('staticLLMClient', () => {
  it('implements the provider contract without network access', async () => {
    const result = await new StaticLLMClient('ok').complete({ messages: [{ role: 'user', content: 'ping' }] })
    expect(result).toMatchObject({ content: 'ok', model: 'static' })
  })
})
