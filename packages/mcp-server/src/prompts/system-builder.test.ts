import { describe, expect, it } from 'vitest'
import { buildIntentSystemPrompt, buildSystemPrompt } from './system-builder'

describe('system-builder prompts', () => {
  it('teaches intent generation that preview rows are display-only', () => {
    const prompt = buildIntentSystemPrompt()

    expect(prompt).toContain('two virtual preview rows')
    expect(prompt).toContain('stay inside the element height')
    expect(prompt).toContain('must not create extra fields, columns, or sections')
    expect(prompt).toContain('array tables describe columns once instead of inventing preview rows')
  })

  it('uses real table-data row roles in schema guidance', () => {
    const prompt = buildSystemPrompt('## Material Context')

    expect(prompt).toContain('"role": "repeat-template"')
    expect(prompt).toContain('virtual preview rows')
    expect(prompt).toContain('full semantic table box in the designer')
    expect(prompt).not.toContain('"kind": "repeat-template"')
  })
})
