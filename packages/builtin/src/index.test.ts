import { assertJsonValue } from '@easyink/shared'
import { describe, expect, it } from 'vitest'
import {
  builtinAllMaterialPackage,
  builtinBasicMaterialPackage,
  builtinNoneMaterialPackage,
  compileBuiltinMaterialProfile,
} from './index'

describe('builtin material packages', () => {
  it('uses one manifest object per type across all surfaces', () => {
    const all = builtinAllMaterialPackage.manifests
    expect(all).toHaveLength(25)
    expect(new Set(all.map(manifest => manifest.type)).size).toBe(all.length)
    expect(all.every(manifest => manifest.facets.viewer)).toBe(true)
    expect(all
      .filter(manifest => manifest.facets.ai?.generation.enabled)
      .every(manifest => manifest.facets.designer))
      .toBe(true)
  })

  it('admits AI generation explicitly with canonical descriptor fields', () => {
    for (const manifest of builtinAllMaterialPackage.manifests) {
      const generation = manifest.facets.ai?.generation
      expect(generation, manifest.type).toBeDefined()
      expect(typeof generation!.enabled, manifest.type).toBe('boolean')
      if (!generation!.enabled)
        continue
      expect(generation!.modelSchema, manifest.type).toBeDefined()
      expect(generation!.bindingShape, manifest.type).toBeDefined()
      expect(generation!.examples.length, manifest.type).toBeGreaterThan(0)
      expect(generation!.requiredModelPaths?.length, manifest.type).toBeGreaterThan(0)
      expect(() => assertJsonValue(manifest.facets.ai?.descriptor), manifest.type).not.toThrow()
      expect(findKey(manifest.facets.ai?.descriptor, 'binding'), manifest.type).toEqual([])
    }
  })

  it('compiles basic, all, and none through the same package boundary', () => {
    expect(compileBuiltinMaterialProfile('basic').materialTypes)
      .toEqual([...builtinBasicMaterialPackage.manifests.map(item => item.type)].sort())
    expect(compileBuiltinMaterialProfile('all').materialTypes)
      .toEqual([...builtinAllMaterialPackage.manifests.map(item => item.type)].sort())
    expect(compileBuiltinMaterialProfile('none').materialTypes).toEqual([])
    expect(builtinNoneMaterialPackage.manifests).toEqual([])
  })

  it('creates every default node from the manifest model', () => {
    const profile = compileBuiltinMaterialProfile('all')
    for (const manifest of builtinAllMaterialPackage.manifests) {
      const node = profile.createNode(manifest.type)
      expect(node.model, manifest.type).toEqual(manifest.common.defaultNode.model)
      expect(node.modelVersion, manifest.type).toBe(1)
    }
  })

  it('uses deterministic zero-based flow-row default column IDs', () => {
    const flow = builtinAllMaterialPackage.manifests.find(manifest => manifest.type === 'flow-row')!
    expect((flow.common.defaultNode.model.columns as Array<{ id: string }>).map(column => column.id))
      .toEqual(['default-0', 'default-1', 'default-2', 'default-3'])
  })

  it('declares canonical data-contract binding shapes for chart generation', () => {
    const chart = builtinAllMaterialPackage.manifests.find(manifest => manifest.type === 'chart-bar')!
    expect(chart.facets.ai?.generation.bindingShape).toMatchObject({
      properties: {
        value: {
          required: ['kind', 'mappings'],
          properties: { kind: { const: 'data-contract' } },
        },
      },
    })
  })
})

function findKey(value: unknown, key: string, path = ''): string[] {
  if (Array.isArray(value))
    return value.flatMap((item, index) => findKey(item, key, `${path}/${index}`))
  if (typeof value !== 'object' || value === null)
    return []
  return Object.entries(value).flatMap(([entryKey, item]) => [
    ...(entryKey === key ? [`${path}/${entryKey}`] : []),
    ...findKey(item, key, `${path}/${entryKey}`),
  ])
}
