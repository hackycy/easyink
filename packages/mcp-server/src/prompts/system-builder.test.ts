import { describe, expect, it } from 'vitest'
import { buildSystemPrompt } from './system-builder'

describe('system-builder prompts', () => {
  it('uses real table-data row roles in schema guidance', () => {
    const prompt = buildSystemPrompt('## Material Context')

    expect(prompt).toContain('"role": "repeat-template"')
    expect(prompt).toContain('virtual preview rows')
    expect(prompt).toContain('full semantic table box in the designer')
    expect(prompt).not.toContain('"kind": "repeat-template"')
  })
})
