import { describe, expect, it } from 'vitest'
import { buildIntentSystemPrompt, buildSystemPrompt } from './system-builder'

describe('system-builder prompts', () => {
  it('teaches intent generation that preview rows are display-only', () => {
    const prompt = buildIntentSystemPrompt()

    expect(prompt).toContain('two virtual preview rows')
    expect(prompt).toContain('Do NOT create extra fields, columns, or sections for them')
    expect(prompt).toContain('array tables describe columns once instead of inventing preview rows')
  })

  it('uses real table-data row roles in schema guidance', () => {
    const prompt = buildSystemPrompt('## Material Context')

    expect(prompt).toContain('"role": "repeat-template"')
    expect(prompt).toContain('virtual preview rows')
    expect(prompt).not.toContain('"kind": "repeat-template"')
  })
})
