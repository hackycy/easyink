import { defineMaterialManifest } from '@easyink/core'
import { createTestCompiledMaterialProfile, createTestMaterialManifest } from '@easyink/core/testing'
import { describe, expect, it } from 'vitest'
import { createAssistantMaterialManifest } from './index'

describe('assistant material manifest bridge', () => {
  it('projects only the editable-renderable-AI intersection', () => {
    const profile = createTestCompiledMaterialProfile([
      createTestMaterialManifest({ type: 'full', designer: true, viewer: true, ai: true }),
      createTestMaterialManifest({ type: 'viewer-only', viewer: true }),
      createTestMaterialManifest({ type: 'ai-disabled', designer: true, viewer: true, ai: {
        generation: { enabled: false, examples: [] },
        descriptor: { description: 'descriptive only' },
      } }),
    ])

    const projected = createAssistantMaterialManifest(profile)

    expect(projected).toMatchObject({ version: 1, profileId: 'test', engineVersion: '0.0.30' })
    expect(projected.materials.map(item => item.type)).toEqual(['full'])
    expect(() => JSON.stringify(projected)).not.toThrow()
  })

  it('uses an explicit JSON-only property projection and retains accessor target paths', () => {
    const base = createTestMaterialManifest({ type: 'property', designer: true, viewer: true, ai: true })
    const manifest = defineMaterialManifest({
      ...base,
      common: {
        ...base.common,
        properties: [{
          key: 'content',
          label: 'Content',
          type: 'string',
          default: 'Hello',
          visible: () => true,
          disabled: () => false,
          accessor: {
            paths: ['/model/content', '/model/a~1b'],
            read: node => node.model.content,
            write: () => undefined,
          },
        }],
      },
      facets: {
        ...base.facets,
        ai: { ...base.facets.ai!, descriptor: { description: 'portable' } },
      },
    })

    const projected = createAssistantMaterialManifest(createTestCompiledMaterialProfile([manifest]))
    expect(projected.materials[0]?.common.properties).toEqual([{
      key: 'content',
      label: 'Content',
      type: 'string',
      default: 'Hello',
      targetPaths: ['/model/content', '/model/a~1b'],
    }])
    expect(JSON.stringify(projected)).not.toContain('visible')
    expect(JSON.stringify(projected)).not.toContain('disabled')
    expect(JSON.stringify(projected)).not.toContain('accessor')
    expect(Object.isFrozen(projected.materials[0]?.common.properties[0]?.targetPaths)).toBe(true)
    expect(Object.isFrozen(projected.materials[0]?.descriptor)).toBe(true)
  })

  it('deep freezes a detached portable projection', () => {
    const source = createTestMaterialManifest({ type: 'frozen', designer: true, viewer: true, ai: true })
    const projected = createAssistantMaterialManifest(createTestCompiledMaterialProfile([source]))
    const entry = projected.materials[0]!

    expect(Object.isFrozen(projected)).toBe(true)
    expect(Object.isFrozen(projected.materials)).toBe(true)
    expect(Object.isFrozen(entry)).toBe(true)
    expect(Object.isFrozen(entry.common)).toBe(true)
    expect(Object.isFrozen(entry.generation)).toBe(true)
    expect(Object.isFrozen(entry.generation.examples)).toBe(true)
    expect(entry.common.defaultNode.model).not.toBe(source.common.defaultNode.model)
    expect(entry.generation.examples[0]).not.toBe(source.facets.ai?.generation.examples[0])
    expect(() => projected.materials.push(entry)).toThrow()
    expect(() => (entry.generation.examples[0] as Record<string, unknown>).value = 'changed').toThrow()
    expect(source.facets.ai?.generation.examples[0]).toEqual({ value: 'example' })
  })
})
