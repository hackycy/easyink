import { describe, expect, it } from 'vitest'
import { createAssistantPreview, generateSchemaCandidate, repairAssistantSchema, validateAssistantSchema } from './index'

describe('assistant capabilities', () => {
  it('generates and validates a deterministic schema candidate', () => {
    const candidate = generateSchemaCandidate({ prompt: '生成一张商超购物小票' })
    const report = validateAssistantSchema(candidate.schema)
    const preview = createAssistantPreview(candidate.schema, candidate.dataSource, candidate.warnings)

    expect(report.valid).toBe(true)
    expect(candidate.schema.elements.length).toBeGreaterThan(0)
    expect(candidate.dataSource.fields.length).toBeGreaterThan(0)
    expect(preview.elementCount).toBeGreaterThan(0)
  })

  it('repairs auto-fixable schema issues before returning to Designer', () => {
    const candidate = generateSchemaCandidate({ prompt: '生成一张商超购物小票' })
    const broken = { ...candidate.schema, version: '', elements: undefined } as never

    const repair = repairAssistantSchema(broken)

    expect(repair.repairs.map(item => item.path)).toContain('version')
    expect(repair.validation.valid).toBe(true)
    expect(repair.schema.elements).toEqual([])
  })

  it('rejects schema elements that are not in the active material manifest', () => {
    const materialManifest = {
      materials: [
        { type: 'text', name: 'Text', capabilities: {}, props: [] },
      ],
    }
    const candidate = generateSchemaCandidate({ prompt: '生成一张商超购物小票' })
    const report = validateAssistantSchema(candidate.schema, { materialManifest })

    expect(report.valid).toBe(false)
    expect(report.errors).toContainEqual(expect.objectContaining({
      code: 'UNREGISTERED_MATERIAL_TYPE',
    }))
  })

  it('constrains deterministic generation to the active material manifest', () => {
    const materialManifest = {
      materials: [
        { type: 'text', name: 'Text', capabilities: {}, props: [] },
      ],
    }
    const candidate = generateSchemaCandidate({
      prompt: '生成一张商超购物小票',
      materialManifest,
    })
    const report = validateAssistantSchema(candidate.schema, { materialManifest })

    expect(report.valid).toBe(true)
    expect(candidate.schema.elements.every(element => element.type === 'text')).toBe(true)
    expect(candidate.warnings).toContainEqual(expect.stringContaining('Material type "table-data" is not registered'))
  })

  it('keeps repair validation scoped to the active material manifest', () => {
    const candidate = generateSchemaCandidate({ prompt: '生成一张商超购物小票' })
    const materialManifest = {
      materials: [
        { type: 'text', name: 'Text', capabilities: {}, props: [] },
      ],
    }

    const repair = repairAssistantSchema(candidate.schema, { materialManifest })

    expect(repair.validation.valid).toBe(false)
    expect(repair.validation.errors).toContainEqual(expect.objectContaining({
      code: 'UNREGISTERED_MATERIAL_TYPE',
    }))
  })
})
