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
    expect(new Set(all.map(manifest => manifest.type)).size).toBe(all.length)
    expect(all.every(manifest => manifest.facets.viewer)).toBe(true)
    expect(all
      .filter(manifest => manifest.facets.ai?.generation.enabled)
      .every(manifest => manifest.facets.designer))
      .toBe(true)
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
})
